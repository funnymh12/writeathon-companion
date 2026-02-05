// 监听快捷键并触发功能
// 注意：此脚本注入到所有网页中运行

// 默认快捷键配置
let globalShortcut = 'Alt+S';
let openMemoShortcut = 'Alt+M';

// 从存储中加载快捷键配置
chrome.storage.local.get(['shortcuts'], (result) => {
    if (result.shortcuts) {
        if (result.shortcuts.globalClip) globalShortcut = result.shortcuts.globalClip;
        if (result.shortcuts.openMemo) openMemoShortcut = result.shortcuts.openMemo;
    }
});

// 监听存储变化，动态更新快捷键
chrome.storage.onChanged.addListener((changes, namespace) => {
    if (namespace === 'local' && changes.shortcuts) {
        const newShortcuts = changes.shortcuts.newValue;
        if (newShortcuts) {
            if (newShortcuts.globalClip) globalShortcut = newShortcuts.globalClip;
            if (newShortcuts.openMemo) openMemoShortcut = newShortcuts.openMemo;
        }
    }
});

// 辅助函数：将按键事件转换为字符串表示
function getShortcutString(event) {
    const parts = [];
    if (event.ctrlKey) parts.push('Ctrl');
    if (event.altKey) parts.push('Alt');
    if (event.shiftKey) parts.push('Shift');
    if (event.metaKey) parts.push('Meta');

    // 忽略单纯的修饰键
    if (['Control', 'Alt', 'Shift', 'Meta'].includes(event.key)) {
        return null;
    }

    // 将按键转换为大写
    let key = event.key;

    // Normalization
    if (key === ' ') key = 'Space';
    if (key.toLowerCase() === 'enter') key = 'Enter';

    // Convert single chars to uppercase
    if (key.length === 1) key = key.toUpperCase();
    // For specialized keys, keep Title Case or as is (ArrowUp, etc)

    parts.push(key);
    return parts.join('+');
}

// Check match case-insensitively and order-independently
function isShortcutMatch(pressed, configured) {
    if (!pressed || !configured) return false;

    const normalize = (s) => s.toLowerCase().split('+').map(p => p.trim()).sort().join('+');
    return normalize(pressed) === normalize(configured);
}

// 监听键盘事件 (Use Capture phase to ensure we get the event before the page stops it)
document.addEventListener('keydown', (event) => {
    // 忽略重复事件（按住不放）
    if (event.repeat) return;

    const pressedShortcut = getShortcutString(event);

    // 如果没有按下有效键或在输入框中，忽略
    if (!pressedShortcut) return;


    // 检查是否在输入框中（避免干扰用户正常输入）
    const target = event.target;
    if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) {
        return;
    }

    if (isShortcutMatch(pressedShortcut, globalShortcut)) {
        // 剪藏选中：检查当前窗口是否有选区
        // 逻辑优化：只有当选区内容不为空时，才阻止默认行为并发送消息
        const selectionObj = window.getSelection();
        if (!selectionObj || selectionObj.isCollapsed || selectionObj.toString().trim().length === 0) {
            // 没有有效选区，直接返回，不阻止默认行为
            // 这允许其他 frame 处理，或者如果没有人有选区，就当做无事发生
            return;
        }

        // 阻止默认行为（防止网页自身的快捷键冲突）
        event.preventDefault();
        event.stopPropagation();

        console.log('[Writeathon] Global shortcut triggered:', globalShortcut);

        let selection = '';
        if (selectionObj.rangeCount > 0) {
            const container = document.createElement('div');
            container.appendChild(selectionObj.getRangeAt(0).cloneContents());

            // Replace images with Markdown
            container.querySelectorAll('img').forEach(img => {
                const alt = img.alt || '图片';
                const src = img.src; // Absolute URL
                if (src) {
                    const textNode = document.createTextNode(`![${alt}](${src})`);
                    img.parentNode?.replaceChild(textNode, img);
                }
            });
            selection = container.innerText || selectionObj.toString();
        }

        // 发送消息给 background script
        chrome.runtime.sendMessage({
            type: 'CLIP_SELECTION',
            payload: {
                title: document.title,
                url: window.location.href,
                selection: selection
            }
        });

    } else if (isShortcutMatch(pressedShortcut, openMemoShortcut)) {
        // 打开侧边栏：允许所有frame触发，但只有top frame处理（或者移除top frame检查）
        // 实际上，如果用户在 iframe 里按快捷键，我们也希望触发。
        // 但为了避免多个 frame 同时发送消息，我们可以通过检查是否 focused 来过滤，
        // 或者，background script 实际上可以处理多次打开请求（它只是 open side panel，是幂等的）。
        // 不过为了性能，我们还是保留 top 检查，但要注意：如果焦点在 iframe 里，top window 可能收不到事件？
        // 不，keydown 事件会冒泡，但如果 iframe 捕获了...
        // 正确的做法：Content Script 注入到了 all_frames: true。
        // 所以每个 frame 都会收到 keydown。
        // 如果我们在 iframe 里按 Alt+M，该 frame 的 shortcuts.js 会触发。
        // 此时 window !== window.top。
        // 如果我们只允许 window.top 触发，那么在 iframe 里按快捷键将无效！
        // 修复：移除 window !== window.top 检查，但加上防抖或依赖 background 幂等性。
        // 由于 openSidePanel 是幂等的，我们允许任意 frame 发送。

        event.preventDefault();
        event.stopPropagation();

        console.log('[Writeathon] Open Memo shortcut triggered:', openMemoShortcut);

        // 发送消息打开侧边栏并切换到速记
        chrome.runtime.sendMessage({
            type: 'OPEN_SIDE_PANEL',
            payload: { tab: 'memo' }
        });
    }
}, true);

// Listen for commands from background script (triggered by native global shortcuts)
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'TRIGGER_CLIP_FROM_BG') {
        const selectionObj = window.getSelection();
        if (!selectionObj || selectionObj.isCollapsed || selectionObj.toString().trim().length === 0) {
            sendResponse({ success: false, reason: 'no_selection' });
            return;
        }

        let selection = '';
        if (selectionObj.rangeCount > 0) {
            const container = document.createElement('div');
            container.appendChild(selectionObj.getRangeAt(0).cloneContents());

            // Replace images with Markdown
            container.querySelectorAll('img').forEach(img => {
                const alt = img.alt || '图片';
                const src = img.src;
                if (src) {
                    const textNode = document.createTextNode(`![${alt}](${src})`);
                    img.parentNode?.replaceChild(textNode, img);
                }
            });
            selection = container.innerText || selectionObj.toString();
        }

        // Just return the selection, let background handle the rest
        sendResponse({
            success: true,
            payload: {
                title: document.title,
                url: window.location.href,
                selection: selection
            }
        });
    }
});
