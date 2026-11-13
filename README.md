# UnrealFabAssistant

简体中文 | [English](/doc/README_EN.md)

把所有虚幻Fab商城免费资产一键入库（可隔一段时间跑一次，自动入库最新的免费资源）

>Note: 代码仅在chrome上测试通过，最好直接使用chrome

### 如何使用

#### 方式1
1. 打开油猴设置-实用工具
2. 在**从URL安装**中粘贴以下链接导入
3. 打开 [Fab](https://www.fab.com/) 或 [Quixel Megascans 卖家页](https://www.fab.com/sellers/Quixel%20Megascans) 并登录。在右下角小窗点击 **Start work** 启动常规入库，或点击下方的 **Add Quixel Megascans** 单独入库该卖家的免费资产。
```javascript
https://raw.githubusercontent.com/RyensX/UnrealFabAssistant/refs/heads/main/tampermonkey.js
```

如果无法访问魔法网络，可以用下方链接（更新可能有延迟）
```javascript
https://gh-proxy.com/raw.githubusercontent.com/RyensX/UnrealFabAssistant/refs/heads/main/tampermonkey.js
```

#### 方式2
1. 打开 [Fab](https://www.fab.com/) 并登录
2. 点击F12打开调试工具并切换到控制台（Console）tab
3. 复制下面的代码到控制台运行。默认执行常规入库。只入库 Quixel Megascans 时，将 `const mode` 的值改成 `'quixel-megascans'`。
```javascript
(async () => {
    const mode = 'all';
    const response = await fetch('https://raw.githubusercontent.com/RyensX/UnrealFabAssistant/refs/heads/main/run.js');
    if (!response.ok) throw new Error(`下载 run.js 失败（HTTP ${response.status}）`);
    const source = await response.text();
    if (mode === 'quixel-megascans' && !source.startsWith('// UnrealFabAssistant supports quixel-megascans')) {
        throw new Error('下载的 run.js 版本尚不支持 Quixel Megascans 模式');
    }
    const script = document.createElement('script');
    script.dataset.runMode = mode;
    script.textContent = source;
    document.head.appendChild(script);
})();
```

如果无法访问 GitHub，可以把上面代码中的下载地址换成下方代理地址。代理更新可能有延迟。

```text
https://gh-proxy.com/raw.githubusercontent.com/RyensX/UnrealFabAssistant/refs/heads/main/run.js
```

#### 方式3
1. 打开当前版本的 [run.js](run.js)，复制全部代码。
2. 打开 [Fab](https://www.fab.com/) 并登录
3. 点击 F12 打开调试工具并切换到控制台（Console）。只入库 Quixel Megascans 时，先执行 `window.unrealFabAssistantMode = 'quixel-megascans'`。
4. 粘贴刚才复制的代码，然后回车并等待日志打印结束。

方式 3 的 Quixel Megascans 设置仅用于下一次运行。单独入库模式会扫描该卖家的全部免费资产结果页，跳过已入库的商品。

### 自动处理限流

常规入库和 Quixel Megascans 单独入库都逐个发送请求，间隔至少 1.5 秒。收到 HTTP 429 后，脚本会暂停后续请求并自动重试当前请求，限流解除后继续原来的进度。默认等待从 30 秒逐步增加到 5 分钟。Fab 通过 `Retry-After` 要求等待更久时，会遵循该时间。运行期间保持 Fab 标签页开启即可。

### 鸣谢
- https://gist.github.com/jamiephan/0c04986c7f2e62d5c87c4e8c8ce115fc

### 其他
1. 若有帮助到您，请点击右上角⭐支持一下，感谢使用
2. 如果进行转载，请注明原出处 https://github.com/RyensX/UnrealFabAssistant
3. 默认快速模式以时间降序查询物品，若超过3页都没有能添加的物品，则认为该分类已经没有新增的，这可能会错过一些旧的资源突然免费的情况，但是可以方便频繁快速白嫖资源。如果需要关闭快速模式，可以运行前控制台执行 **window.fastMode=false**
