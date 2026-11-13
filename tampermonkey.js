// ==UserScript==
// @name         UnrealFabAssistant
// @namespace    http://tampermonkey.net/
// @version      1.2
// @description  UnrealFabAssistan油猴脚本
// @author       https://github.com/RyensX/UnrealFabAssistant
// @match        https://www.fab.com/
// @match        https://www.fab.com/*-*/
// @match        https://www.fab.com/sellers/Quixel%20Megascans
// @match        https://www.fab.com/*-*/sellers/Quixel%20Megascans
// @grant        none
// @license      GPL-3.0
// ==/UserScript==

(function () {
    'use strict';

    /* 样式配置 */
    const STYLE_CONFIG = {
        container: {
            width: '380px',
            height: '300px',
            position: 'fixed',
            bottom: '20px',
            right: '20px',
            background: 'rgba(30, 30, 30, 0.95)',
            color: '#e0e0e0',
            fontFamily: 'monospace, "Courier New"',
            fontSize: '13px',
            borderRadius: '6px',
            boxShadow: '0 0 15px rgba(0,0,0,0.6)',
            zIndex: '2147483647',
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column'
        },
        logTypes: {
            log: { color: '#4CAF50', icon: '●' },
            info: { color: '#2196F3', icon: 'ℹ' },
            warn: { color: '#FFC107', icon: '⚠' },
            error: { color: '#F44336', icon: '✖' },
            debug: { color: '#9C27B0', icon: '⚙' }
        }
    };

    /* 初始化日志容器 */
    const logContainer = document.createElement('div');
    Object.assign(logContainer.style, STYLE_CONFIG.container);
    logContainer.id = 'tm-console-viewer';
    document.body.appendChild(logContainer);

    /* 创建控制栏 */
    const controlBar = document.createElement('div');
    controlBar.style.display = 'flex';
    controlBar.style.justifyContent = 'space-between';
    controlBar.style.alignItems = 'center';
    controlBar.style.gap = '10px';
    controlBar.style.padding = '8px';
    controlBar.style.borderBottom = '1px solid #444';
    controlBar.style.background = 'rgba(30, 30, 30, 0.95)';
    controlBar.style.flexShrink = '0';

    const title = document.createElement('div');
    title.textContent = 'UnrealFabAssistant';
    title.style.color = '#fff';
    title.style.fontWeight = 'bold';
    title.style.marginRight = 'auto';

    const closeBtn = document.createElement('button');
    closeBtn.innerHTML = '×';
    closeBtn.style.cssText = `
        padding: 0 8px;
        background: transparent;
        border: none;
        color: #fff;
        font-size: 20px;
        line-height: 1;
        cursor: pointer;
        transition: opacity 0.2s;
    `;
    closeBtn.onclick = () => logContainer.remove();
    closeBtn.onmouseover = () => closeBtn.style.opacity = '0.8';
    closeBtn.onmouseout = () => closeBtn.style.opacity = '1';

    controlBar.append(title, closeBtn);
    logContainer.appendChild(controlBar);

    /* 创建日志内容区域 */
    const logContent = document.createElement('div');
    logContent.style.overflowY = 'auto';
    logContent.style.flexGrow = '1';
    logContent.style.padding = '0 10px';
    logContent.style.position = 'relative'; // 新增定位上下文
    logContainer.appendChild(logContent);

    /* 添加日志区域遮罩层 */
    const overlay = document.createElement('div');
    Object.assign(overlay.style, {
        position: 'absolute',
        top: '0',
        left: '0',
        width: '100%',
        height: '100%',
        backgroundColor: 'rgba(0, 0, 0, 0.9)',
        display: 'flex',
        flexDirection: 'column',
        gap: '10px',
        justifyContent: 'center',
        alignItems: 'center',
        backdropFilter: 'blur(2px)',
        zIndex: '1' // 确保在日志内容之上
    });

    const buttonStyle = `
        padding: 12px 24px;
        background: #4CAF50;
        color: white;
        border: none;
        border-radius: 5px;
        cursor: pointer;
        font-size: 14px;
        font-weight: bold;
        transition: transform 0.1s, background 0.3s;
    `;

    const loadError = document.createElement('div');
    loadError.style.cssText = 'color: #ff9494; padding: 0 16px; text-align: center;';
    loadError.setAttribute('role', 'alert');
    loadError.hidden = true;

    let isStart = false;
    /* 创建两个入口共用的启动按钮 */
    function createStartButton(label, runMode) {
        const button = document.createElement('button');
        button.type = 'button';
        button.textContent = label;
        button.style.cssText = buttonStyle;
        // 按钮悬停样式。
        button.addEventListener('mouseover', () => button.style.background = '#45a049');
        button.addEventListener('mouseout', () => button.style.background = '#4CAF50');
        // 点击后加载入库脚本，并将所选模式传给它。
        button.addEventListener('click', async () => {
            if (isStart) return;
            isStart = true;
            overlay.remove();

            try {
                const response = await fetch('https://raw.githubusercontent.com/RyensX/UnrealFabAssistant/refs/heads/main/run.js');
                if (!response.ok) throw new Error(`HTTP ${response.status}`);
                const script = document.createElement('script');
                script.dataset.runMode = runMode;
                script.textContent = await response.text();
                // 旧版脚本会忽略专用模式，检查通过后才注入页面。
                if (runMode === 'quixel-megascans' && !script.textContent.startsWith('// UnrealFabAssistant supports quixel-megascans')) {
                    throw new Error('Quixel Megascans mode is not available in the downloaded run.js.');
                }
                document.head.appendChild(script);
            } catch (error) {
                loadError.textContent = `Unable to load run.js: ${error.message}`;
                loadError.hidden = false;
                isStart = false;
                logContent.prepend(overlay);
            }
        });
        return button;
    }

    overlay.append(
        createStartButton('Start work', 'all'),
        createStartButton('Add Quixel Megascans', 'quixel-megascans'),
        loadError
    );
    logContent.appendChild(overlay);

    /* 保存原生方法 */
    const nativeConsole = {
        log: console.log,
        info: console.info,
        warn: console.warn,
        error: console.error,
        debug: console.debug
    };

    /* 重写控制台方法 */
    Object.keys(STYLE_CONFIG.logTypes).forEach(type => {
        console[type] = function (...args) {
            nativeConsole[type].apply(console, args);
            appendLog(type, args);
        };
    });

    /* 日志处理函数 */
    function appendLog(type, args) {
        if (!isStart)
            return
        const logEntry = document.createElement('div');
        logEntry.className = `log-entry log-${type}`;
        logEntry.style.padding = '6px 0';
        logEntry.style.borderBottom = '1px solid #373737';
        logEntry.style.display = 'flex';
        logEntry.style.alignItems = 'flex-start';
        logEntry.style.gap = '8px';

        // 类型图标
        const typeIcon = document.createElement('span');
        typeIcon.textContent = STYLE_CONFIG.logTypes[type].icon;
        typeIcon.style.color = STYLE_CONFIG.logTypes[type].color;
        typeIcon.style.marginRight = '8px';
        typeIcon.style.flexShrink = '0';

        // 内容处理
        const contentSpan = document.createElement('span');
        contentSpan.style.flex = '1';
        contentSpan.style.overflowWrap = 'anywhere';
        contentSpan.style.textAlign = 'left';

        contentSpan.append(...args.map(arg => {
            const elem = document.createElement('span');
            elem.style.wordBreak = 'break-all';

            if (typeof arg === 'object' && arg !== null) {
                try {
                    elem.textContent = JSON.stringify(arg, null, 2);
                } catch {
                    elem.textContent = arg.toString();
                }
                elem.style.color = '#FF9800';
            } else {
                elem.textContent = arg;
                elem.style.color = '#BDBDBD';
            }
            return elem;
        }));

        logEntry.append(typeIcon, contentSpan);
        logContent.appendChild(logEntry);
        logContent.scrollTop = logContent.scrollHeight;
    }

    /* 样式隔离 */
    const style = document.createElement('style');
    style.textContent = `
        #tm-console-viewer * {
            box-sizing: border-box;
            margin: 0;
            white-space: pre-wrap;
        }
        #tm-console-viewer button:active {
            transform: translateY(1px);
        }

        /* 自定义滚动条 */
        #tm-console-viewer > div:last-child::-webkit-scrollbar {
            width: 8px;
            height: 8px;
        }
        #tm-console-viewer > div:last-child::-webkit-scrollbar-track {
            background: rgba(20, 20, 20, 0.3);
            border-radius: 4px;
        }
        #tm-console-viewer > div:last-child::-webkit-scrollbar-thumb {
            background: rgba(100, 100, 100, 0.5);
            border-radius: 4px;
        }
        #tm-console-viewer > div:last-child::-webkit-scrollbar-thumb:hover {
            background: rgba(120, 120, 120, 0.6);
        }
        #tm-console-viewer > div:last-child::-webkit-scrollbar-corner {
            background: transparent;
        }
    `;
    document.head.appendChild(style);
})();
