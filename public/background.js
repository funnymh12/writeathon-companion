// Background service worker for Side Panel behavior
chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true })
    .catch((error) => console.error(error));

// ============= 右键菜单功能 =============

// 创建右键菜单
chrome.runtime.onInstalled.addListener(() => {
    // 选中文字的菜单项
    chrome.contextMenus.create({
        id: 'send-text-to-writeathon',
        title: '发送到写拉松',
        contexts: ['selection']
    });

    // 图片的菜单项
    chrome.contextMenus.create({
        id: 'save-image-to-writeathon',
        title: '保存到写拉松',
        contexts: ['image']
    });

    // 链接的菜单项
    chrome.contextMenus.create({
        id: 'save-link-to-writeathon',
        title: '保存链接到写拉松',
        contexts: ['link']
    });
});

// 处理右键菜单点击
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
    // 获取存储的认证信息
    const stored = await chrome.storage.local.get(['token', 'userId', 'selectedSpaceId']);

    if (!stored.token || !stored.userId) {
        // 未认证，显示提示并打开侧边栏
        if (tab?.id) {
            await chrome.sidePanel.open({ tabId: tab.id });
        }
        return;
    }

    const { token, userId, selectedSpaceId } = stored;
    const pageUrl = tab?.url || '';
    const pageTitle = tab?.title || '未命名';

    try {
        if (info.menuItemId === 'send-text-to-writeathon') {
            // 发送选中的文字
            const selectedText = info.selectionText;
            if (!selectedText) return;

            await sendToWriteathon({
                token,
                userId,
                spaceId: selectedSpaceId,
                title: pageTitle,
                content: selectedText,
                attachments: [{
                    type: 'link',
                    title: pageTitle,
                    url: pageUrl,
                    from: 'default'
                }]
            });

            showNotification(tab?.id, '发送成功', `已将选中文字保存到写拉松`);

        } else if (info.menuItemId === 'save-image-to-writeathon') {
            // 保存图片
            const imageUrl = info.srcUrl;
            if (!imageUrl) return;

            await sendToWriteathon({
                token,
                userId,
                spaceId: selectedSpaceId,
                title: pageTitle,
                content: `![图片](${imageUrl})`,
                attachments: [{
                    type: 'image',
                    title: '来自 ' + pageTitle,
                    url: imageUrl,
                    content: `来源: ${pageUrl}`
                }]
            });

            showNotification(tab?.id, '保存成功', `已将图片保存到写拉松`);

        } else if (info.menuItemId === 'save-link-to-writeathon') {
            // 保存链接
            const linkUrl = info.linkUrl;
            const linkText = info.selectionText || linkUrl;
            if (!linkUrl) return;

            await sendToWriteathon({
                token,
                userId,
                spaceId: selectedSpaceId,
                title: pageTitle,
                content: `[${linkText}](${linkUrl})`,
                attachments: [{
                    type: 'link',
                    title: linkText,
                    url: linkUrl,
                    from: 'default'
                }]
            });

            showNotification(tab?.id, '保存成功', `已将链接保存到写拉松`);
        }
    } catch (error) {
        console.error('保存失败:', error);
        showNotification(tab?.id, '保存失败', error.message || '请检查网络连接和配置', true);
    }
});

// 发送数据到写拉松API
async function sendToWriteathon({ token, userId, spaceId, title, content, attachments }) {
    const body = {
        title,
        content
    };

    // 添加空间参数（如果有选择非默认空间）
    if (spaceId) {
        body.space = spaceId;
    }

    // 添加附件参数
    if (attachments && attachments.length > 0) {
        body.attachments = JSON.stringify(attachments);
    }

    const response = await fetch(`https://api.writeathon.cn/v1/users/${userId}/cards`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'x-writeathon-token': token
        },
        body: JSON.stringify(body)
    });

    const data = await response.json();

    if (!data.success) {
        throw new Error(data.message || 'API错误');
    }

    return data;
}

// 显示通知
function showNotification(tabId, title, message, isError = false) {
    console.log(`[写拉松] ${title}: ${message}`);

    if (tabId) {
        chrome.scripting.executeScript({
            target: { tabId },
            func: (title, message, isError) => {
                // 创建一个简单的toast通知
                const toast = document.createElement('div');
                toast.style.cssText = `
                    position: fixed;
                    top: 20px;
                    right: 20px;
                    background: ${isError ? '#FF4D4F' : '#52C41A'};
                    color: white;
                    padding: 12px 20px;
                    border-radius: 8px;
                    font-size: 14px;
                    z-index: 999999;
                    box-shadow: 0 4px 12px rgba(0,0,0,0.15);
                    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
                    animation: writeathonSlideIn 0.3s ease;
                    max-width: 300px;
                `;
                toast.innerHTML = `<strong>${title}</strong><br><span style="font-size:12px;">${message}</span>`;

                // 添加动画样式
                if (!document.getElementById('writeathon-toast-style')) {
                    const style = document.createElement('style');
                    style.id = 'writeathon-toast-style';
                    style.textContent = `
                        @keyframes writeathonSlideIn {
                            from { transform: translateX(100%); opacity: 0; }
                            to { transform: translateX(0); opacity: 1; }
                        }
                    `;
                    document.head.appendChild(style);
                }

                document.body.appendChild(toast);

                setTimeout(() => {
                    toast.style.opacity = '0';
                    toast.style.transition = 'opacity 0.3s';
                    setTimeout(() => toast.remove(), 300);
                }, 3000);
            },
            args: [title, message, isError]
        }).catch(console.error);
    }
}
