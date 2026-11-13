// UnrealFabAssistant supports quixel-megascans
// 首行供油猴和控制台加载器检查版本兼容性。
((async (fastMode) => {
    // 加载器通过 script 的 data-run-mode 指定模式，直接粘贴时读取一次性设置。
    const script = document.currentScript
    const injectedMode = script?.dataset.runMode
    const runMode = injectedMode ?? window.unrealFabAssistantMode ?? "all"
    if (injectedMode == null) delete window.unrealFabAssistantMode
    if (runMode !== "all" && runMode !== "quixel-megascans") {
        return console.error(`Unknown UnrealFabAssistant mode: ${runMode}`)
    }
    if (location.origin !== "https://www.fab.com") {
        return console.error("Open www.fab.com and sign in before running UnrealFabAssistant.")
    }

    const quixelOnly = runMode === "quixel-megascans"
    const REQUEST_INTERVAL_MS = 200
    const MAX_CONCURRENT_LISTINGS = 3
    const INITIAL_BACKOFF_MS = 30000
    const MAX_BACKOFF_MS = 5 * 60 * 1000
    const rateLimitCounts = { search: 0, states: 0, details: 0, "add-to-library": 0 }
    let nextRequestAt = 0
    let rateLimitedUntil = 0
    const wait = async ms => {
        // 浏览器对单次定时器有上限，较长的 Retry-After 分段等待。
        const MAX_TIMER_MS = 2147483647
        while (ms > 0) {
            const delay = Math.min(ms, MAX_TIMER_MS)
            await new Promise(resolve => setTimeout(resolve, delay))
            ms -= delay
        }
    }

    const getCookie = (name) => {
        const value = `; ${document.cookie}`;
        const parts = value.split(`; ${name}=`);
        if (parts.length === 2) return parts.pop().split(';').shift();
    }

    // 同源请求由浏览器携带 Cookie，HTTP 错误交由调用方处理。
    const fetchFab = async (endpoint, url, options = {}) => {
        let backoff = INITIAL_BACKOFF_MS
        while (true) {
            // 并发任务错开发送时间，并共用限流暂停时间。
            while (true) {
                const now = performance.now()
                const remaining = Math.max(nextRequestAt, rateLimitedUntil) - now
                if (remaining <= 0) {
                    nextRequestAt = now + REQUEST_INTERVAL_MS
                    break
                }
                await wait(remaining)
            }
            const response = await fetch(url, {
                ...options,
                headers: { accept: "application/json, text/plain, */*", ...options.headers }
            })
            if (response.ok) return response

            if (response.status !== 429) {
                throw new Error(`Fab returned HTTP ${response.status}`)
            }

            // 本地退避最多 5 分钟。Fab 给出更长的 Retry-After 时，按它的要求等待。
            const retryAfter = response.headers.get("Retry-After")?.trim() ?? ""
            const serverDelay = /^\d+$/.test(retryAfter)
                ? Number(retryAfter) * 1000
                : Date.parse(retryAfter) - Date.now()
            const delay = Math.max(backoff, Number.isSafeInteger(serverDelay) ? serverDelay : 0)
            rateLimitedUntil = Math.max(rateLimitedUntil, performance.now() + delay)
            const seconds = Math.ceil((rateLimitedUntil - performance.now()) / 1000)
            rateLimitCounts[endpoint]++
            reportProgress()
            console.warn(`Fab returned HTTP 429 (${endpoint}). Pausing new requests for at least ${seconds} seconds before retrying.`)
            backoff = Math.min(backoff * 2, MAX_BACKOFF_MS)
        }
    }

    /**
     * 获取一页商品。
     * @returns {Promise<[string|null, string[]]>} 下一页游标和当前页的商品 ID。
     */
    const getItemsApi = async (next, url) => {
        const response = await fetchFab("search", `${url}&cursor=${encodeURIComponent(next)}`)
        const data = await response.json()
        if (!Array.isArray(data.results)) throw new Error("Fab did not return listing results.")
        return [data.cursors?.next ?? null, data.results.map(result => result.uid)]
    }

    /**
     * 添加到库。Fab 返回 HTTP 204 时计为成功。
     */
    const addLibApi = async (token, uid, offerId) => {
        const body = new FormData()
        body.set("offer_id", offerId)
        const response = await fetchFab("add-to-library", `https://www.fab.com/i/listings/${uid}/add-to-library`, {
            headers: { "x-csrftoken": token, "x-requested-with": "XMLHttpRequest" },
            body,
            method: "POST"
        })
        if (response.status !== 204) throw new Error(`Unexpected add-to-library response: HTTP ${response.status}`)
    }

    /**
     * 获取商品详情，读取入库所需的 offerId。
     */
    const listingsApi = async (uid) => {
        const response = await fetchFab("details", `https://www.fab.com/i/listings/${uid}`)
        const data = await response.json()
        // 只考虑零价报价，优先选择专业版。
        const freeOffers = (data.licenses ?? []).filter(license => license?.priceTier?.price === 0 && license.offerId)
        const offer = freeOffers.find(license => license.slug === "professional") ?? freeOffers.at(-1)
        return [offer?.offerId, offer?.slug, data.title]
    }


    /**
     * 批量获取当前账号对这些商品的入库状态。
     */
    const listingsStateApi = async (token, uids) => {
        if (!uids.length) return new Map()
        let uidParams = uids.map(uid => `listing_ids=${uid}`).join("&")
        const response = await fetchFab("states", `https://www.fab.com/i/users/me/listings-states?${uidParams}`, {
            headers: { "x-csrftoken": token, "x-requested-with": "XMLHttpRequest" }
        })
        const data = await response.json()
        return new Map(data.map(item => [item.uid, item.acquired]))
    }

    console.log("⭐ UnrealFabAssistant: Automatically add all free resources from Fab to your account")
    console.log("⭐ Powered by https://github.com/RyensX/UnrealFabAssistant")

    console.log("-> Checking User Info...")
    // 从 Cookie 读取入库请求所需的 CSRF token。
    const csrftoken = getCookie("fab_csrftoken")
    if (!csrftoken) {
        return console.error("-> Error: cannot find csrftoken. Please login again.")
    }

    console.log("-> Start Process Items...")
    const startedAt = performance.now()
    let totalCount = 0
    // 油猴面板通过当前脚本元素接收进度。直接粘贴运行时使用控制台日志。
    const reportProgress = (finished = false) => {
        script?.dispatchEvent(new CustomEvent("unreal-fab-assistant-progress", {
            detail: { totalCount, startedAt, rateLimitedUntil, finished }
        }))
    }
    reportProgress()
    // 常规快速模式连续 3 页未成功入库即停止，适合按时间倒序查看新资产。
    // Quixel Megascans 专用模式始终扫描全部结果页。
    const MAX_EMPTY_PAGE = 3
    const countMap = {}
    let itemFailures = 0

    const urls = quixelOnly ? {
        // 按创建时间排序可使用时间游标，避免商品类型排序在偏移量 5000 后回环。
        "Quixel Megascans": "https://www.fab.com/i/listings/search?currency=USD&seller=Quixel%20Megascans&is_free=1&sort_by=-createdAt"
    } : {
        "UE": "https://www.fab.com/i/listings/search?channels=unreal-engine&is_free=1&sort_by=-createdAt",
        "Unity": "https://www.fab.com/i/listings/search?channels=unity&is_free=1&sort_by=-createdAt",
        "UEFN": "https://www.fab.com/i/listings/search?channels=uefn&is_free=1&sort_by=-createdAt",
        "Quixel": "https://www.fab.com/i/listings/search?currency=USD&seller=Quixel&sort_by=listingTypeWeight"
        //这里如果仅仅只需要其中一种类型资源，比如只需要UE的，那可以只保留UE的链接
    }
    const scan = async (name, url) => {
        console.log(`start by name=${name} url=${url}`)
        let nextPage = null
        let currentPageIndex = 1
        let emptyPages = 0
        countMap[name] = 0
        const seenCursors = new Set()
        do {
            if (seenCursors.has(nextPage)) throw new Error("Fab repeated a pagination cursor.")
            seenCursors.add(nextPage)
            const [cursor, uids] = await getItemsApi(nextPage, url)
            nextPage = cursor
            console.log(`${name} page ${currentPageIndex++}, ${uids.length} listings`)
            // 先批量检查入库状态，已入库的商品跳过，保留账号现有的许可。
            const states = await listingsStateApi(csrftoken, uids)
            const countBeforePage = countMap[name]
            const reportListingError = (uid, error) => {
                itemFailures++
                console.error(`${name}: ${uid} failed: ${error?.message ?? error}`)
            }
            const pending = [...new Set(uids)].filter(uid => {
                const acquired = states.get(uid)
                if (acquired === false) return true
                if (acquired !== true) reportListingError(uid, "Fab did not return a library state.")
                return false
            })
            const remainingListings = pending.values()
            // 一个任务完成就取下一件商品，其他任务可以继续执行。
            const worker = async () => {
                for (const uid of remainingListings) {
                    try {
                        const [offerId, type, title] = await listingsApi(uid)
                        if (!offerId) continue
                        await addLibApi(csrftoken, uid, offerId)
                        countMap[name]++
                        totalCount++
                        reportProgress()
                        console.log(`${name}: added ${title} (${type})`)
                    } catch (error) {
                        reportListingError(uid, error)
                    }
                }
            }
            await Promise.all(Array.from({ length: Math.min(MAX_CONCURRENT_LISTINGS, pending.length) }, worker))
            emptyPages = countMap[name] === countBeforePage ? emptyPages + 1 : 0
        } while (nextPage && (quixelOnly || !fastMode || emptyPages < MAX_EMPTY_PAGE))
    }
    // 逐个扫描分类，当前分类完成后再扫描下一个。
    let interrupted = 0
    for (const [name, url] of Object.entries(urls)) {
        try {
            await scan(name, url)
        } catch (error) {
            interrupted++
            console.error(`${name} scan stopped: ${error?.message ?? error}`)
        }
    }

    reportProgress(true)
    const elapsed = Math.max(0, performance.now() - startedAt)
    const speed = elapsed > 0 ? totalCount * 60000 / elapsed : 0
    console.info(`Average speed: ${speed.toFixed(1)} items/min over ${(elapsed / 1000).toFixed(1)} s, including retry waits.`)
    console.info(`HTTP 429 by endpoint: ${Object.entries(rateLimitCounts).map(([endpoint, count]) => `${endpoint}=${count}`).join(", ")}.`)
    let countDetail = totalCount > 0 ?
        "(" + Object.entries(countMap).map(([key, value]) => `${key}:${value}`).join(" ") + ")"
        : ""
    if (interrupted || itemFailures) {
        console.warn(`Finished with errors. ${totalCount}${countDetail} items added, ${itemFailures} listing errors, ${interrupted} interrupted scans.`)
    } else {
        console.log(`\n✅ All done! ${totalCount}${countDetail} items added.`)
    }
})(window.fastMode ?? console.fastMode ?? true))
