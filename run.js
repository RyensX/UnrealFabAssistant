// UnrealFabAssistant supports quixel-megascans
// 首行供油猴和控制台加载器检查版本兼容性。
((async (fastMode) => {
    // 加载器通过 script 的 data-run-mode 指定模式，直接粘贴时读取一次性设置。
    const injectedMode = document.currentScript?.dataset.runMode
    const runMode = injectedMode ?? window.unrealFabAssistantMode ?? "all"
    if (injectedMode == null) delete window.unrealFabAssistantMode
    if (runMode !== "all" && runMode !== "quixel-megascans") {
        return console.error(`Unknown UnrealFabAssistant mode: ${runMode}`)
    }
    if (location.origin !== "https://www.fab.com") {
        return console.error("Open www.fab.com and sign in before running UnrealFabAssistant.")
    }

    const getCookie = (name) => {
        const value = `; ${document.cookie}`;
        const parts = value.split(`; ${name}=`);
        if (parts.length === 2) return parts.pop().split(';').shift();
    }

    // 同源请求由浏览器携带 Cookie，HTTP 错误交由调用方处理。
    const fetchFab = async (url, options = {}) => {
        const response = await fetch(url, {
            ...options,
            headers: { accept: "application/json, text/plain, */*", ...options.headers }
        })
        if (!response.ok) {
            throw Object.assign(new Error(`Fab returned HTTP ${response.status}`), { status: response.status })
        }
        return response
    }

    /**
     * 获取一页商品。
     * @returns {Promise<[string|null, string[]]>} 下一页游标和当前页的商品 ID。
     */
    const getItemsApi = async (next, url) => {
        const response = await fetchFab(`${url}&cursor=${encodeURIComponent(next)}`)
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
        const response = await fetchFab(`https://www.fab.com/i/listings/${uid}/add-to-library`, {
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
        const response = await fetchFab(`https://www.fab.com/i/listings/${uid}`)
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
        const response = await fetchFab(`https://www.fab.com/i/users/me/listings-states?${uidParams}`, {
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
    // 常规快速模式连续 3 页未成功入库即停止，适合按时间倒序查看新资产。
    // Quixel Megascans 专用模式按商品类型排序，因此扫描全部结果页。
    const MAX_EMPTY_PAGE = 3
    const countMap = {}
    let itemFailures = 0

    const quixelOnly = runMode === "quixel-megascans"
    const urls = quixelOnly ? {
        "Quixel Megascans": "https://www.fab.com/i/listings/search?currency=USD&seller=Quixel%20Megascans&is_free=1&sort_by=listingTypeWeight"
    } : {
        "UE": "https://www.fab.com/i/listings/search?channels=unreal-engine&is_free=1&sort_by=-createdAt",
        "Unity": "https://www.fab.com/i/listings/search?channels=unity&is_free=1&sort_by=-createdAt",
        "UEFN": "https://www.fab.com/i/listings/search?channels=uefn&is_free=1&sort_by=-createdAt",
        "Quixel": "https://www.fab.com/i/listings/search?currency=USD&seller=Quixel&sort_by=listingTypeWeight"
        //这里如果仅仅只需要其中一种类型资源，比如只需要UE的，那可以只保留UE的链接
    }
    const entries = Object.entries(urls)
    const mainTasks = entries.map(async ([name, url]) => {
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
            const tasks = uids.map(async uid => {
                const acquired = states.get(uid)
                if (acquired === true) return
                if (acquired !== false) throw new Error("Fab did not return a library state.")
                // 查询未入库商品的详情，拿到免费报价后再提交入库。
                const [offerId, type, title] = await listingsApi(uid)
                if (!offerId) return
                await addLibApi(csrftoken, uid, offerId)
                countMap[name]++
                console.log(`${name}: added ${title} (${type})`)
            })
            // 单个商品失败时保留本页其他结果。遇到限流则停止当前扫描的后续分页。
            const results = await Promise.allSettled(tasks)
            const rateLimited = results.find(result => result.status === "rejected" && result.reason?.status === 429)
            results.forEach((result, index) => {
                if (result.status === "fulfilled") return
                itemFailures++
                console.error(`${name}: ${uids[index]} failed: ${result.reason?.message ?? result.reason}`)
            })
            if (rateLimited) throw rateLimited.reason
            emptyPages = countMap[name] === countBeforePage ? emptyPages + 1 : 0
        } while (nextPage && (quixelOnly || !fastMode || emptyPages < MAX_EMPTY_PAGE))
    })
    const scans = await Promise.allSettled(mainTasks)
    const interrupted = scans.filter((result, index) => {
        if (result.status === "fulfilled") return false
        console.error(`${entries[index][0]} scan stopped: ${result.reason?.message ?? result.reason}`)
        return true
    }).length

    const totalCount = Object.values(countMap).reduce((sum, count) => sum + count, 0)
    let countDetail = totalCount > 0 ?
        "(" + Object.entries(countMap).map(([key, value]) => `${key}:${value}`).join(" ") + ")"
        : ""
    if (interrupted || itemFailures) {
        console.warn(`Finished with errors. ${totalCount}${countDetail} items added, ${itemFailures} listing errors, ${interrupted} interrupted scans.`)
    } else {
        console.log(`\n✅ All done! ${totalCount}${countDetail} items added.`)
    }
})(window.fastMode ?? console.fastMode ?? true))
