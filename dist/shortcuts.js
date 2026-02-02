// 监听快捷键并触发功能
// 注意：此脚本注入到所有网页中运行

// 默认快捷键配置
let globalShortcut = 'Alt+S';

// 从存储中加载快捷键配置
chrome.storage.local.get(['shortcuts'], (result) => {
    if (result.shortcuts && result.shortcuts.globalClip) {
        globalShortcut = result.shortcuts.globalClip;
    }
});

// 监听存储变化，动态更新快捷键
chrome.storage.onChanged.addListener((changes, namespace) => {
    if (namespace === 'local' && changes.shortcuts) {
        const newShortcuts = changes.shortcuts.newValue;
        if (newShortcuts && newShortcuts.globalClip) {
            globalShortcut = newShortcuts.globalClip;
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
    let key = event.key.toUpperCase();
    if (key === ' ') key = 'Space';
    if (key === 'ENTER') key = 'Enter';

    parts.push(key);
    return parts.join('+');
}

// 监听键盘事件
document.addEventListener('keydown', (event) => {
    const pressedShortcut = getShortcutString(event);

    // 如果没有按下有效键或在输入框中，忽略
    if (!pressedShortcut) return;

    // 检查是否在输入框中（避免干扰用户正常输入）
    const target = event.target;
    if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) {
        return;
    }

    if (pressedShortcut === globalShortcut) {
        // 阻止默认行为（防止网页自身的快捷键冲突）
        event.preventDefault();
        event.stopPropagation();

        console.log('[Writeathon] Global shortcut triggered:', globalShortcut);

        // 获取当前选中的文本
        const selection = window.getSelection()?.toString() || '';

        // 发送消息给 background script
        chrome.runtime.sendMessage({
            type: 'CLIP_SELECTION',
            payload: {
                title: document.title,
                url: window.location.href,
                selection: selection
            }
        });
    }
});
