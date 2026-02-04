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
    const pressedShortcut = getShortcutString(event);

    // 如果没有按下有效键或在输入框中，忽略
    if (!pressedShortcut) return;

    // 检查是否在输入框中（避免干扰用户正常输入）
    const target = event.target;
    if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) {
        return;
    }

    if (isShortcutMatch(pressedShortcut, globalShortcut)) {
        // 阻止默认行为（防止网页自身的快捷键冲突）
        event.preventDefault();
        event.stopPropagation();

        console.log('[Writeathon] Global shortcut triggered:', globalShortcut);

        // 获取当前选中的文本
        // 获取当前选中的内容 (包含图片处理)
        const selectionObj = window.getSelection();
        let selection = '';

        if (selectionObj && selectionObj.rangeCount > 0 && !selectionObj.isCollapsed) {
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
        event.preventDefault();
        event.stopPropagation();

        // 发送消息打开侧边栏并切换到速记
        chrome.runtime.sendMessage({
            type: 'OPEN_SIDE_PANEL',
            payload: { tab: 'memo' }
        });
    }
}, true);
