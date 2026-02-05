// Background service worker for Side Panel behavior
chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true })
    .catch((error) => console.error(error));

// ============= 全局快捷键处理 =============
chrome.commands.onCommand.addListener(async (command) => {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    const tab = tabs[0];
    if (!tab) return;

    console.log('[Writeathon] Command triggered:', command);

    if (command === 'clip-selection') {
        try {
            // 尝试向 Content Script 发送消息获取选区
            const response = await chrome.tabs.sendMessage(tab.id, { type: 'TRIGGER_CLIP_FROM_BG' });

            if (response && response.success) {
                const { title, url, selection } = response.payload;
                handleQuickClip(tab.id, title, url, selection);
            } else if (response?.reason === 'no_selection') {
                showNotification(tab.id, '提示', '请先选中要剪藏的文字', true);
            }
        } catch (e) {
            console.log('Content script unreachable, trying fallback:', e);
            // Fallback: 使用 executeScript 获取纯文本 (适用于 Content Script 未加载的情况)
            try {
                const results = await chrome.scripting.executeScript({
                    target: { tabId: tab.id },
                    func: () => window.getSelection()?.toString() || ''
                });

                const text = results[0]?.result;
                if (text && text.trim().length > 0) {
                    handleQuickClip(tab.id, tab.title || '未命名', tab.url || '', text);
                } else {
                    showNotification(tab.id, '提示', '无法获取选区，请尝试刷新页面', true);
                }
            } catch (innerE) {
                console.error('Fallback failed:', innerE);
                showNotification(tab.id, '无法剪藏', '此页面不支持快捷键剪藏', true);
            }
        }
    }
});

// ============= 右键菜单功能 =============

// 创建右键菜单
chrome.runtime.onInstalled.addListener(() => {
    // 选中文字的菜单项
    chrome.contextMenus.create({
        id: 'send-text-to-writeathon',
        title: '发送到写拉松',
        contexts: ['selection']
    });

    // 选中文字保存为 Prompt
    chrome.contextMenus.create({
        id: 'save-as-prompt',
        title: '保存为 Prompt',
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
    const stored = await chrome.storage.local.get(['token', 'userId', 'selectedSpaceId', 'selectedSpaceName']);

    if (!stored.token || !stored.userId) {
        // 未认证，显示提示并打开侧边栏
        if (tab?.id) {
            await chrome.sidePanel.open({ tabId: tab.id });
        }
        return;
    }

    const { token, userId, selectedSpaceId, selectedSpaceName } = stored;
    const spaceNameDisplay = selectedSpaceName ? `(${selectedSpaceName})` : '';
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
                title: `剪藏 ${new Date().toLocaleString('zh-CN')}`,
                content: `${selectedText}\n\n> 来源: [${pageTitle}](${pageUrl})` + formatLogFooter(`${selectedText}\n\n> 来源: [${pageTitle}](${pageUrl})`),
                attachments: [{
                    type: 'link',
                    title: pageTitle,
                    url: pageUrl,
                    from: 'default'
                }]
            });

            showNotification(tab?.id, '发送成功', `已将选中文字保存到写拉松 ${spaceNameDisplay}`);

        } else if (info.menuItemId === 'save-image-to-writeathon') {
            // 保存图片
            const imageUrl = info.srcUrl;
            if (!imageUrl) return;

            let finalImageUrl = imageUrl;

            // 获取 imgbb API Key 用于处理防盗链图片
            const { imgbbApiKey } = await chrome.storage.local.get(['imgbbApiKey']);

            try {
                // 改进防盗链检测：域黑名单 + 响应检测
                // 微信等网站会针对防盗链返回 200 OK 的「提示图片」，因此常规检测会失效
                const needsProxy = isLikelyHotlinked(imageUrl) || !(await checkUrlAccessible(imageUrl));

                if (needsProxy && imgbbApiKey) {
                    console.log('[写拉松] 检测到极可能存在防盗链的图片，尝试通过图床中转:', imageUrl);
                    const base64 = await fetchImageAsBase64(imageUrl);
                    if (base64) {
                        const uploadedUrl = await uploadToImgbb(base64, imgbbApiKey);
                        if (uploadedUrl) {
                            finalImageUrl = uploadedUrl;
                            console.log('[写拉松] 图片中转成功:', finalImageUrl);
                        }
                    }
                }
            } catch (e) {
                console.warn('[写拉松] 图片防盗链检测或上传过程中出错:', e);
            }

            await sendToWriteathon({
                token,
                userId,
                spaceId: selectedSpaceId,
                title: pageTitle,
                content: `![图片](${finalImageUrl})` + formatLogFooter(`![图片](${finalImageUrl})`),
                attachments: [{
                    type: 'image',
                    title: '来自 ' + pageTitle,
                    url: finalImageUrl,
                    content: `来源: ${pageUrl}`
                }]
            });

            showNotification(tab?.id, '保存成功', `已将图片保存到写拉松 ${spaceNameDisplay}`);

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
                content: `[${linkText}](${linkUrl})` + formatLogFooter(`[${linkText}](${linkUrl})`),
                attachments: [{
                    type: 'link',
                    title: linkText,
                    url: linkUrl,
                    from: 'default'
                }]
            });

            showNotification(tab?.id, '保存成功', `已将链接保存到写拉松 ${spaceNameDisplay}`);

        } else if (info.menuItemId === 'save-as-prompt') {
            // 保存为 Prompt
            const selectedText = info.selectionText;
            if (!selectedText) return;

            // 获取 Prompt 空间 ID
            const promptData = await chrome.storage.local.get(['promptSpaceId']);
            const promptSpaceId = promptData.promptSpaceId;

            if (!promptSpaceId) {
                // 未设置 Prompt 空间，提示用户
                showNotification(tab?.id, '未设置 Prompt 空间', '请先在插件设置中选择 Prompt 存储空间', true);
                if (tab?.id) {
                    await chrome.sidePanel.open({ tabId: tab.id });
                }
                return;
            }

            // 生成 Prompt 标题（取前20个字符）
            const promptTitle = selectedText.substring(0, 30).replace(/\n/g, ' ').trim() + (selectedText.length > 30 ? '...' : '');

            await sendToWriteathon({
                token,
                userId,
                spaceId: promptSpaceId,
                title: promptTitle,
                content: selectedText + `\n\n> 来源: [${pageTitle}](${pageUrl})`
            });

            showNotification(tab?.id, '保存成功', '已保存为 Prompt');
        }
    } catch (error) {
        console.error('保存失败:', error);
        const code = error.errorCode ? `[${error.errorCode}] ` : '';
        const spaceInfo = selectedSpaceName ? ` (${selectedSpaceName})` : '';
        showNotification(tab?.id, '保存失败', `${code}${error.message || '未知错误'}${spaceInfo}`, true);
    }
});

// 处理来自 Content Script 的消息 (全局快捷键)
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'CLIP_SELECTION') {
        const { title, url, selection } = message.payload;
        // Need to get the tabId from sender
        const tabId = sender.tab?.id;
        handleQuickClip(tabId, title, url, selection);
    }

    if (message.type === 'OPEN_SIDE_PANEL') {
        const tabId = sender.tab?.id;
        if (tabId) {
            // 设置一个标记告知侧边栏打开后应该显示哪个 tab
            chrome.storage.local.set({ jumpToTab: message.payload.tab || 'memo' }).then(() => {
                chrome.sidePanel.open({ tabId });
            });
        }
    }

    // 处理获取图片并转换为 base64 的请求（用于防盗链图片处理）
    if (message.type === 'FETCH_IMAGE_AS_BASE64') {
        const imageUrl = message.url;

        fetchImageAsBase64(imageUrl)
            .then(base64 => {
                sendResponse({ success: true, base64 });
            })
            .catch(error => {
                console.error('Failed to fetch image:', error);
                sendResponse({ success: false, error: error.message });
            });

        // 返回 true 表示将异步发送响应
        return true;
    }
});

// 获取远程图片并转换为 base64
async function fetchImageAsBase64(imageUrl) {
    try {
        // 对于防盗链极强的网站（如微信），有时需要空 Referer 才能获取原图
        // 背景脚本 fetch 默认不带 Referer，这通常能绕过简单的防护
        const response = await fetch(imageUrl, {
            method: 'GET',
            credentials: 'omit',
            headers: {
                'Accept': 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
                'Cache-Control': 'no-cache',
                'Pragma': 'no-cache'
            }
        });

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const blob = await response.blob();

        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => {
                resolve(reader.result);
            };
            reader.onerror = () => {
                reject(new Error('Failed to read blob as base64'));
            };
            reader.readAsDataURL(blob);
        });
    } catch (error) {
        console.error('fetchImageAsBase64 error:', error);
        throw error;
    }
}

// 检测是否为已知的高频防盗链域名
function isLikelyHotlinked(url) {
    if (!url) return false;
    const hotlinkDomains = [
        'mmbiz.qpic.cn',   // 微信公众号
        'zhimg.com',       // 知乎
        'baidu.com',       // 百度
        'sinaimg.cn',      // 新浪
        '163.com',         // 网易
        'pstatp.com',      // 今日头条/字节
        'qpic.cn',         // 腾讯通用图片
        'qlogo.cn',        // 腾讯头像
        'csdnimg.cn',      // CSDN
        'jianshu.io',      // 简书
        'medium.com'       // Medium
    ];

    try {
        const hostname = new URL(url).hostname;
        return hotlinkDomains.some(domain => hostname.includes(domain));
    } catch {
        return false;
    }
}

// 检测 URL 是否可访问
async function checkUrlAccessible(url) {
    try {
        // 使用 HEAD 请求并设置 cache: no-store
        const response = await fetch(url, {
            method: 'HEAD',
            mode: 'no-cors',
            cache: 'no-store'
        });

        // 如果是 opaque 类型，说明受到了 CORS 限制，这种图片大概率在写拉松后台无法被正常抓取/渲染
        // 我们将其视为需要中转
        if (response.type === 'opaque') return false;

        return response.ok;
    } catch (e) {
        return false;
    }
}

// 上传到 imgbb
async function uploadToImgbb(base64Image, apiKey) {
    try {
        const base64Data = base64Image.replace(/^data:image\/\w+;base64,/, '');
        const formData = new FormData();
        formData.append('image', base64Data);
        formData.append('key', apiKey);

        const response = await fetch('https://api.imgbb.com/1/upload', {
            method: 'POST',
            body: formData
        });

        const result = await response.json();
        if (result.success && result.data?.url) {
            return result.data.url;
        }
        return null;
    } catch (err) {
        console.error('imgbb upload error:', err);
        return null;
    }
}


async function handleQuickClip(tabId, pageTitle, pageUrl, selectedText) {
    if (!selectedText) {
        showNotification(tabId, '提示', '请先选中要剪藏的文字', true);
        return;
    }

    const stored = await chrome.storage.local.get(['token', 'userId', 'selectedSpaceId', 'selectedSpaceName']);

    if (!stored.token || !stored.userId) {
        showNotification(tabId, '未登录', '请先点击插件图标进行登录', true);
        return;
    }

    const { token, userId, selectedSpaceId, selectedSpaceName } = stored;
    const spaceNameDisplay = selectedSpaceName ? `(${selectedSpaceName})` : '';

    try {
        await sendToWriteathon({
            token,
            userId,
            spaceId: selectedSpaceId,
            title: `剪藏 ${new Date().toLocaleString('zh-CN')}`,
            content: `${selectedText}\n\n> 来源: [${pageTitle}](${pageUrl})` + formatLogFooter(`${selectedText}\n\n> 来源: [${pageTitle}](${pageUrl})`),
            attachments: [{
                type: 'link',
                title: pageTitle,
                url: pageUrl,
                from: 'default'
            }]
        });

        showNotification(tabId, '发送成功', `已将选中文字保存到写拉松 ${spaceNameDisplay}`);
    } catch (error) {
        console.error('快捷保存失败:', error);
        const code = error.errorCode ? `[${error.errorCode}] ` : '';
        const spaceInfo = selectedSpaceName ? ` (${selectedSpaceName})` : '';
        showNotification(tabId, '保存失败', `${code}${error.message || '未知错误'}${spaceInfo}`, true);
    }
}

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
        const error = new Error(data.message || 'API错误');
        if (data.errorCode) error.errorCode = data.errorCode;
        throw error;
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

function formatLogFooter(content) {
    const now = new Date();
    const pad = (n) => n.toString().padStart(2, '0');
    const yyyy = now.getFullYear();
    const mm = pad(now.getMonth() + 1);
    const dd = pad(now.getDate());
    const hh = pad(now.getHours());
    const min = pad(now.getMinutes());
    const count = content ? content.length : 0;
    return `\n\nlog：${yyyy}${mm}${dd}${hh}${min}，${count}\n\n`;
}
