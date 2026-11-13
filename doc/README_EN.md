# UnrealFabAssistant

[简体中文](../README.md) | English

Automatically add all free resources from Fab to your account.(You can run it once in a while to automatically add the latest free resources)

>Note: The code has only been tested on Chrome, it is best to use Chrome directly.

### How to use

#### Method 1
1. Open Tampermonkey Settings-Utilities.
2. Paste the following link in **Install from URL** to import.
3. Open [Fab](https://www.fab.com/) or the [Quixel Megascans seller page](https://www.fab.com/sellers/Quixel%20Megascans) and sign in. In the lower-right panel, click **Start work** for the standard scan or **Add Quixel Megascans** below it to add only that seller's free assets.
```javascript
https://raw.githubusercontent.com/RyensX/UnrealFabAssistant/refs/heads/main/tampermonkey.js
```

#### Method 2
1. Open [Fab](https://www.fab.com/) and login.
2. Click F12 to open the debugger and switch to the Console tab.
3. Paste the code below into the console and press Enter. It runs the standard scan by default. To add only Quixel Megascans assets, set `const mode` to `'quixel-megascans'`.
```javascript
(async () => {
    const mode = 'all';
    const response = await fetch('https://raw.githubusercontent.com/RyensX/UnrealFabAssistant/refs/heads/main/run.js');
    if (!response.ok) throw new Error(`Could not download run.js (HTTP ${response.status})`);
    const source = await response.text();
    if (mode === 'quixel-megascans' && !source.startsWith('// UnrealFabAssistant supports quixel-megascans')) {
        throw new Error('The downloaded run.js does not support Quixel Megascans mode yet');
    }
    const script = document.createElement('script');
    script.dataset.runMode = mode;
    script.textContent = source;
    document.head.appendChild(script);
})();
```

#### Method 3
1. Open the current [run.js](../run.js) and copy all of its code.
2. Open [Fab](https://www.fab.com/) and login.
3. Press F12 and switch to the Console tab. To add only Quixel Megascans assets, first run `window.unrealFabAssistantMode = 'quixel-megascans'`.
4. Paste the code you copied, press Enter, and wait for the completion log.

The Method 3 setting applies to the next run only. Quixel Megascans mode scans every page of the seller's free assets and skips items already in your library.

### Automatic retries after rate limiting

Both modes send one request at a time, at least 1.5 seconds apart. When Fab returns HTTP 429, the script pauses subsequent requests and automatically retries the current one until the rate limit clears. The default delay grows from 30 seconds to five minutes, and the script honors longer waits specified by Fab's `Retry-After` header. Keep the Fab tab open while the scan runs.

### Acknowledgements
- https://gist.github.com/jamiephan/0c04986c7f2e62d5c87c4e8c8ce115fc

### Others
1. If it helps you, please click ⭐ in the upper right corner to support it. Thank you for using it.
2. If you reprint it, please indicate the original source https://github.com/RyensX/UnrealFabAssistant
3. The default fast mode searches for items in descending order of time. If there are no items that can be added for more than 3 pages, it is considered that there are no new items in the category. This may miss some old resources that are suddenly free, but it is convenient to frequently and quickly get free resources. If you need to turn off the fast mode, you can execute **window.fastMode=false** in the console before running the code
