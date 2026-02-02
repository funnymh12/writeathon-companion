import React, { useState, useEffect } from 'react';
import { WriteathonClient, Space, Attachment } from '../utils/api';
import { storage } from '../utils/storage';
import { Loader2, Download, Send, Check, Link as LinkIcon, RefreshCw, Image, FolderOpen, Paperclip } from 'lucide-react';

interface ClipperData {
    title: string;
    content: string;
    url: string;
    excerpt?: string;
    stats: { words: number; images: number; links: number };
}

const Clipper: React.FC = () => {
    const [title, setTitle] = useState('');
    const [content, setContent] = useState('');
    const [sourceUrl, setSourceUrl] = useState('');
    const [excerpt, setExcerpt] = useState('');
    const [loading, setLoading] = useState(false);
    const [sending, setSending] = useState(false);
    const [status, setStatus] = useState<'idle' | 'success' | 'error'>('idle');
    const [mode, setMode] = useState<'page' | 'link' | 'image'>('page');

    // Web Page Mode
    const [saveUrl, setSaveUrl] = useState(true);
    const [dataUrl, setDataUrl] = useState(''); // Valid URL for Link/Image modes

    // Image Mode
    const [pageImages, setPageImages] = useState<{ src: string; alt: string; selected: boolean }[]>([]);

    const [stats, setStats] = useState({ words: 0, images: 0, links: 0 });
    const [error, setError] = useState('');
    const [quickSendKey, setQuickSendKey] = useState('Ctrl+Enter');

    // 空间相关
    const [spaces, setSpaces] = useState<Space[]>([]);
    const [selectedSpace, setSelectedSpace] = useState('');
    const [loadingSpaces, setLoadingSpaces] = useState(false);

    // 提取的图片列表 (For content extraction)
    const [extractedImages, setExtractedImages] = useState<{ alt: string; url: string }[]>([]);

    useEffect(() => {
        fetchSpaces();
        loadSavedSpace();
        storage.get().then(data => {
            if (data.shortcuts && data.shortcuts.quickSend) {
                setQuickSendKey(data.shortcuts.quickSend);
            }
        });
    }, []);

    const loadSavedSpace = async () => {
        const data = await storage.get();
        if (data.selectedSpaceId) {
            setSelectedSpace(data.selectedSpaceId);
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        const getKeyString = (ev: React.KeyboardEvent) => {
            const parts = [];
            if (ev.ctrlKey) parts.push('Ctrl');
            if (ev.altKey) parts.push('Alt');
            if (ev.shiftKey) parts.push('Shift');
            if (ev.metaKey) parts.push('Meta');

            let key = ev.key.toUpperCase();
            if (['CONTROL', 'ALT', 'SHIFT', 'META'].includes(key)) return null;
            if (key === ' ') key = 'Space';
            if (key === 'ENTER') key = 'Enter';

            parts.push(key);
            return parts.join('+');
        };

        const pressed = getKeyString(e);
        if (pressed === quickSendKey) {
            e.preventDefault();
            handleSave();
        }
    };

    const fetchSpaces = async () => {
        setLoadingSpaces(true);
        try {
            const data = await storage.get();
            if (data.token && data.userId) {
                const client = new WriteathonClient(data.token, data.userId);
                const response = await client.getSpaces();
                if (response.success && response.data) {
                    setSpaces(response.data);
                    // If no space selected yet, try to restore saved space
                    if (!selectedSpace) {
                        const savedSpaceId = data.selectedSpaceId;
                        if (savedSpaceId) {
                            // Verify the saved space still exists
                            const exists = response.data.find(s => (s._id || s.id) === savedSpaceId);
                            if (exists) {
                                setSelectedSpace(savedSpaceId);
                            }
                        }
                    }
                }
            }
        } catch (err) {
            console.error('获取空间列表失败', err);
        } finally {
            setLoadingSpaces(false);
        }
    };

    const handleSpaceChange = async (spaceId: string) => {
        setSelectedSpace(spaceId);
        const spaceName = spaces.find(s => (s._id || s.id) === spaceId)?.title || '默认空间';
        await storage.set({ selectedSpaceId: spaceId, selectedSpaceName: spaceName });
    };

    const injectClipper = async (tabId: number) => {
        try {
            await chrome.scripting.executeScript({
                target: { tabId },
                files: ['clipper.js']
            });
        } catch (e) {
            console.warn('Clipper injection failed (maybe already injected):', e);
        }
    };

    const runClipper = async (tabId: number): Promise<ClipperData | null> => {
        try {
            const results = await chrome.scripting.executeScript({
                target: { tabId },
                func: () => {
                    if ((window as any).writeathonClipper) {
                        return (window as any).writeathonClipper.getArticle({ includeImages: true });
                    }
                    return {
                        title: document.title,
                        content: document.body.innerText.substring(0, 5000),
                        url: window.location.href,
                        stats: { words: document.body.innerText.length, images: 0, links: 0 }
                    };
                }
            });
            return results[0]?.result;
        } catch (e) {
            console.error('Clipper execution failed:', e);
            return null;
        }
    };

    // --- Link Parsing Logic ---
    // Helper: Simple HTML to Markdown conversion (mirrors clipper.js logic)
    const htmlToMarkdown = (node: Element): string => {
        if (!node) return '';
        let out = '';
        Array.from(node.childNodes).forEach(child => {
            if (child.nodeType === Node.TEXT_NODE) {
                out += child.textContent?.replace(/[\n\t]+/g, ' ').replace(/\s+/g, ' ') || '';
                return;
            }
            if (child.nodeType !== Node.ELEMENT_NODE) return;
            const el = child as Element;
            const tag = el.tagName.toLowerCase();
            const innerContent = htmlToMarkdown(el);

            switch (tag) {
                case 'h1': out += `\n# ${innerContent}\n\n`; break;
                case 'h2': out += `\n## ${innerContent}\n\n`; break;
                case 'h3': out += `\n### ${innerContent}\n\n`; break;
                case 'h4': out += `\n#### ${innerContent}\n\n`; break;
                case 'p': out += `\n${innerContent.trim()}\n\n`; break;
                case 'br': out += '  \n'; break;
                case 'hr': out += '\n---\n'; break;
                case 'ul':
                case 'ol':
                    Array.from(el.children).forEach((li, idx) => {
                        const prefix = tag === 'ol' ? `${idx + 1}.` : '-';
                        out += `${prefix} ${htmlToMarkdown(li).trim()}\n`;
                    });
                    out += '\n';
                    break;
                case 'blockquote': out += `\n> ${innerContent.trim().replace(/\n/g, '\n> ')}\n\n`; break;
                case 'code': out += ` \`${innerContent}\` `; break;
                case 'pre': out += `\n\`\`\`\n${el.textContent?.trim() || ''}\n\`\`\`\n\n`; break;
                case 'strong': case 'b': out += ` **${innerContent.trim()}** `; break;
                case 'em': case 'i': out += ` *${innerContent.trim()}* `; break;
                case 'a':
                    let href = el.getAttribute('href');
                    if (href && !href.startsWith('javascript:')) {
                        out += ` [${innerContent.trim()}](${href}) `;
                    } else out += ` ${innerContent} `;
                    break;
                case 'img':
                    let src = el.getAttribute('src') || el.getAttribute('data-src');
                    const alt = el.getAttribute('alt') || '';
                    if (src && !src.startsWith('data:')) out += `\n![${alt}](${src})\n`;
                    break;
                case 'div': case 'section': case 'article':
                    out += `\n${innerContent}\n`;
                    break;
                default:
                    out += innerContent;
            }
        });
        return out.replace(/\n\s*\n\s*\n/g, '\n\n').trim();
    };

    const handleParseLink = async () => {
        if (!dataUrl) {
            setError('请输入有效的链接地址');
            return;
        }
        if (!dataUrl.startsWith('http')) {
            setError('链接必须以 http 或 https 开头');
            return;
        }

        setLoading(true);
        setError('');

        try {
            const response = await fetch(dataUrl);
            if (!response.ok) throw new Error('网络请求失败');
            const html = await response.text();

            const parser = new DOMParser();
            const doc = parser.parseFromString(html, 'text/html');

            // Extract Title
            const parsedTitle = doc.querySelector('meta[property="og:title"]')?.getAttribute('content') ||
                doc.querySelector('title')?.textContent || '未命名链接';

            // Remove junk elements
            doc.querySelectorAll('script, style, nav, header, footer, iframe, noscript, aside, form').forEach(el => el.remove());

            // Find article content
            const article = doc.querySelector('article') || doc.querySelector('main') || doc.querySelector('.article') || doc.querySelector('.content') || doc.body;

            // Convert to Markdown
            const parsedContent = htmlToMarkdown(article);

            setTitle(parsedTitle.trim());
            setContent(parsedContent.substring(0, 15000)); // Safety limit

            setStats({
                words: parsedContent.replace(/\s/g, '').length,
                images: (parsedContent.match(/!\[/g) || []).length,
                links: (parsedContent.match(/\]\(/g) || []).length
            });

            setSourceUrl(dataUrl);

        } catch (err: any) {
            console.error('Parse error:', err);
            setError('解析失败，可能是由于跨域限制或链接无法访问');
        } finally {
            setLoading(false);
        }
    };

    // --- Image Mode Logic ---
    const handleFetchPageImages = async () => {
        setLoading(true);
        setPageImages([]);
        try {
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            if (!tab?.id) return;

            const results = await chrome.scripting.executeScript({
                target: { tabId: tab.id },
                func: () => {
                    return Array.from(document.images)
                        .filter(img => img.src && img.width > 100 && img.height > 100) // Filter small icons
                        .map(img => ({ src: img.src, alt: img.alt || 'Image' }));
                }
            });

            if (results[0]?.result) {
                setPageImages(results[0].result.map(img => ({ ...img, selected: false })));
            }
        } catch (err) {
            console.error(err);
            setError('获取图片失败');
        } finally {
            setLoading(false);
        }
    };

    const toggleImageSelection = (index: number) => {
        setPageImages(prev => prev.map((img, i) => i === index ? { ...img, selected: !img.selected } : img));
    };

    const handlePasteImage = async () => {
        try {
            setError('');
            const clipboardItems = await navigator.clipboard.read();
            for (const item of clipboardItems) {
                if (item.types && item.types.some(type => type.startsWith('image/'))) {
                    const blob = await item.getType(item.types.find(type => type.startsWith('image/'))!);
                    const reader = new FileReader();
                    reader.onload = (e) => {
                        const result = e.target?.result as string;
                        if (result) {
                            setPageImages(prev => [{ src: result, alt: 'Clipboard Image', selected: true }, ...prev]);
                        }
                    };
                    reader.readAsDataURL(blob);
                    return;
                }
            }
            setError('剪贴板中没有图片');
        } catch (err) {
            console.error(err);
            setError('无法读取剪贴板图片');
        }
    };

    // Upload image to imgbb
    const uploadToImgbb = async (base64Image: string, apiKey: string): Promise<string | null> => {
        try {
            // Remove data URL prefix if present
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
            console.error('imgbb upload failed:', result);
            return null;
        } catch (err) {
            console.error('imgbb upload error:', err);
            return null;
        }
    };

    // 将远程图片URL转换为base64（用于防盗链图片）
    const fetchImageAsBase64 = async (imageUrl: string): Promise<string | null> => {
        try {
            // 使用 background script 来获取图片（绕过 CORS）
            return new Promise((resolve) => {
                chrome.runtime.sendMessage(
                    { type: 'FETCH_IMAGE_AS_BASE64', url: imageUrl },
                    (response) => {
                        if (response && response.success) {
                            resolve(response.base64);
                        } else {
                            console.warn('Failed to fetch image:', response?.error);
                            resolve(null);
                        }
                    }
                );
            });
        } catch (err) {
            console.error('fetchImageAsBase64 error:', err);
            return null;
        }
    };

    // 检测图片是否可以正常访问（防盗链检测）
    const checkImageAccessible = async (imageUrl: string): Promise<boolean> => {
        try {
            // 使用 Image 对象加载测试
            return new Promise((resolve) => {
                const img = document.createElement('img');
                img.onload = () => resolve(true);
                img.onerror = () => resolve(false);
                // 添加随机参数避免缓存
                img.src = imageUrl + (imageUrl.includes('?') ? '&' : '?') + '_t=' + Date.now();
                // 5秒超时
                setTimeout(() => resolve(false), 5000);
            });
        } catch (err) {
            return false;
        }
    };

    // 处理防盗链图片：检测并上传无法访问的图片到imgbb
    const processHotlinkProtectedImages = async (
        contentText: string,
        images: { alt: string; url: string }[],
        imgbbApiKey: string
    ): Promise<string> => {
        let processedContent = contentText;

        for (const image of images) {
            // 跳过已经是 imgbb 的图片或 data URL
            if (image.url.includes('imgbb.com') || image.url.includes('ibb.co') || image.url.startsWith('data:')) {
                continue;
            }

            // 检测图片是否可以访问
            const isAccessible = await checkImageAccessible(image.url);
            if (!isAccessible) {
                console.log('Hotlink protected image detected:', image.url);

                // 获取图片的 base64 数据
                const base64Data = await fetchImageAsBase64(image.url);
                if (base64Data) {
                    // 上传到 imgbb
                    const uploadedUrl = await uploadToImgbb(base64Data, imgbbApiKey);
                    if (uploadedUrl) {
                        // 替换内容中的图片链接
                        const oldMarkdown = `![${image.alt}](${image.url})`;
                        const newMarkdown = `![${image.alt}](${uploadedUrl})`;
                        processedContent = processedContent.replace(oldMarkdown, newMarkdown);
                        console.log('Replaced hotlink image:', image.url, '->', uploadedUrl);
                    }
                }
            }
        }

        return processedContent;
    };

    // 从markdown内容中提取图片
    const extractImages = (content: string): { alt: string; url: string }[] => {
        const imageRegex = /!\[([^\]]*)\]\(([^)]+)\)/g;
        const images: { alt: string; url: string }[] = [];
        let match;

        while ((match = imageRegex.exec(content)) !== null) {
            images.push({
                alt: match[1],
                url: match[2]
            });
        }

        return images;
    };

    const handleClip = async () => {
        setLoading(true);
        setError('');
        try {
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            if (!tab || !tab.id) {
                setError('无法获取当前标签页');
                return;
            }

            if (tab.url?.startsWith('chrome://') || tab.url?.startsWith('edge://') || tab.url?.startsWith('chrome-extension://')) {
                setError('无法在浏览器内部页面使用剪藏功能');
                return;
            }

            setSourceUrl(tab.url || '');

            await injectClipper(tab.id);
            const data = await runClipper(tab.id);

            if (data) {
                setTitle(data.title || tab.title || '');
                setContent(data.content || '');
                setStats(data.stats || { words: 0, images: 0, links: 0 });
                setExcerpt(data.excerpt || '');

                // 提取图片
                const images = extractImages(data.content || '');
                setExtractedImages(images);
            } else {
                setTitle(tab.title || '');
                const results = await chrome.scripting.executeScript({
                    target: { tabId: tab.id },
                    func: () => document.body.innerText.substring(0, 5000)
                });
                setContent(results[0]?.result || '');
            }
        } catch (err: any) {
            console.error('提取页面内容失败', err);
            setError(err.message || '提取失败，请检查页面权限');
        } finally {
            setLoading(false);
        }
    };

    // Split content into chunks at paragraph boundaries
    const splitContent = (text: string, maxLength: number): string[] => {
        const chunks: string[] = [];
        const paragraphs = text.split(/\n\n+/);
        let currentChunk = '';

        for (const para of paragraphs) {
            if (para.length > maxLength) {
                if (currentChunk) {
                    chunks.push(currentChunk.trim());
                    currentChunk = '';
                }
                const sentences = para.split(/(?<=[。！？.!?])\s*/);
                for (const sentence of sentences) {
                    if ((currentChunk + sentence).length > maxLength) {
                        if (currentChunk) chunks.push(currentChunk.trim());
                        currentChunk = sentence;
                    } else {
                        currentChunk += sentence;
                    }
                }
            } else if ((currentChunk + '\n\n' + para).length > maxLength) {
                if (currentChunk) chunks.push(currentChunk.trim());
                currentChunk = para;
            } else {
                currentChunk = currentChunk ? currentChunk + '\n\n' + para : para;
            }
        }

        if (currentChunk.trim()) {
            chunks.push(currentChunk.trim());
        }

        return chunks;
    };

    // 构建 attachments 数组
    const buildAttachments = (): Attachment[] => {
        const attachments: Attachment[] = [];

        // Image Mode: Add selected images
        if (mode === 'image') {
            pageImages.filter(img => img.selected).forEach((img, index) => {
                attachments.push({
                    type: 'image',
                    title: img.alt || `图片 ${index + 1}`,
                    url: img.src,
                    content: `来自剪藏`
                });
            });
            return attachments;
        }

        // Web Page Mode: Add source link
        if (sourceUrl && saveUrl) {
            attachments.push({
                type: 'link',
                title: title || '来源页面',
                url: sourceUrl,
                excerpt: excerpt || '',
                from: 'default',
                content: excerpt || ''
            });
        }

        // Add extracted images from content (if any) as attachments?
        // Actually, for Web Page mode, we typically just keep them in Markdown or add if user requests.
        // Let's keep it simple: Page mode -> Link attachment. Image mode -> Image attachments.

        return attachments;
    };

    const handleSave = async () => {
        setSending(true);
        setStatus('idle');
        setError('');

        try {
            const data = await storage.get();
            if (!data.token || !data.userId) {
                setError('请先在设置中登录');
                setSending(false);
                return;
            }

            const client = new WriteathonClient(data.token, data.userId);

            // Determine content to save
            let finalContent = content;
            let finalTitle = title;

            // Link Mode handling (Fallback if no content parsed)
            if (mode === 'link' && !content.trim()) {
                if (!dataUrl) { setError('请输入 URLs'); setSending(false); return; }
                finalTitle = title || '网页链接';
                finalContent = `[${title || dataUrl}](${dataUrl})\n\n> 链接剪藏`;
            }

            // Image Mode handling
            if (mode === 'image') {
                const selectedImages = pageImages.filter(i => i.selected);
                if (selectedImages.length === 0) { setError('请选择至少一张图片'); setSending(false); return; }

                // Check for imgbb API key
                const imgbbApiKey = data.imgbbApiKey;
                if (!imgbbApiKey) {
                    setError('请先在设置中配置 imgbb API Key');
                    setSending(false);
                    return;
                }

                // Upload images to imgbb and collect URLs
                const uploadedUrls: string[] = [];
                for (let i = 0; i < selectedImages.length; i++) {
                    const img = selectedImages[i];
                    // Check if it's a base64 image (clipboard)
                    if (img.src.startsWith('data:')) {
                        const uploadedUrl = await uploadToImgbb(img.src, imgbbApiKey);
                        if (uploadedUrl) {
                            uploadedUrls.push(uploadedUrl);
                        } else {
                            console.warn(`Failed to upload clipboard image ${i + 1}`);
                        }
                    } else {
                        // 检测是否为防盗链图片
                        const isAccessible = await checkImageAccessible(img.src);
                        if (!isAccessible) {
                            console.log('Detection: Hotlink protection for', img.src);
                            // 尝试通过背景脚本抓取并上传
                            const base64 = await fetchImageAsBase64(img.src);
                            if (base64) {
                                const uploadedUrl = await uploadToImgbb(base64, imgbbApiKey);
                                if (uploadedUrl) {
                                    uploadedUrls.push(uploadedUrl);
                                    continue;
                                }
                            }
                        }
                        // 如果可访问或上传失败，退而求其实直接使用原始 URL
                        uploadedUrls.push(img.src);
                    }
                }

                if (uploadedUrls.length === 0) {
                    setError('图片上传失败，请检查 API Key');
                    setSending(false);
                    return;
                }

                finalTitle = title.trim() || new Date().toLocaleString('zh-CN');
                // Build Markdown content with all images
                finalContent = uploadedUrls.map((url, idx) => `![Image ${idx + 1}](${url})`).join('\n\n');
                finalContent += `\n\n> 剪藏于 ${new Date().toLocaleString('zh-CN')}`;
            }

            // 处理网页模式和链接模式中的防盗链图片
            if ((mode === 'page' || mode === 'link') && finalContent.trim()) {
                const imgbbApiKey = data.imgbbApiKey;
                if (imgbbApiKey) {
                    // 提取内容中的所有图片
                    const images = extractImages(finalContent);
                    if (images.length > 0) {
                        console.log(`Processing ${images.length} images for hotlink protection...`);
                        finalContent = await processHotlinkProtectedImages(finalContent, images, imgbbApiKey);
                    }
                } else {
                    console.warn('imgbb API Key not configured, skipping hotlink protection');
                }
            }

            const MAX_CHUNK_SIZE = 4500;
            // Use splitContent if we have real content (Page mode or Link mode with parsed content)
            const hasRealContent = mode === 'page' || (mode === 'link' && content.trim().length > 0);
            const chunks = hasRealContent ? splitContent(finalContent, MAX_CHUNK_SIZE) : [finalContent];

            const totalChunks = chunks.length;
            const cardTitle = finalTitle.trim() || `剪藏 ${new Date().toLocaleString('zh-CN')}`;

            for (let i = 0; i < chunks.length; i++) {
                let chunkContent = chunks[i];

                if (hasRealContent && totalChunks > 1) {
                    chunkContent = `**[${i + 1}/${totalChunks}]**\n\n${chunkContent}`;
                }

                // Add source URL if Page Mode or Link Mode (parsed)
                const currentSourceUrl = mode === 'link' ? dataUrl : sourceUrl;
                if (hasRealContent && i === 0 && saveUrl && currentSourceUrl) {
                    chunkContent += `\n\n> Source: [${currentSourceUrl}](${currentSourceUrl})`;
                }

                const params: any = {
                    content: chunkContent,
                    title: cardTitle,
                    space: selectedSpace || undefined
                };

                // Add Attachments (Only for first chunk or Image Mode)
                if (i === 0) {
                    const attachments = buildAttachments();
                    if (attachments.length > 0) {
                        params.attachments = JSON.stringify(attachments);
                    }
                }

                const response = await client.createCard(params);
                if (!response.success) throw new Error(response.message || '保存失败');
            }

            setStatus('success');
            setTimeout(() => {
                setStatus('idle');
                if (mode === 'image') setPageImages([]);
                if (mode === 'link') { setDataUrl(''); setTitle(''); }
                if (mode === 'page') { setContent(''); setTitle(''); }
            }, 2000);

        } catch (err: any) {
            setStatus('error');
            setError(err.message || '保存失败');
        } finally {
            setSending(false);
        }
    };

    const handleContentChange = (value: string) => {
        setContent(value);
        const words = value.replace(/\s+/g, '').length;
        const images = (value.match(/!\[.*?\]\(.*?\)/g) || []).length;
        const links = (value.match(/\[.*?\]\(.*?\)/g) || []).length - images;
        setStats({ words, images, links });
        setExtractedImages(extractImages(value));
    };

    return (
        <div className="flex flex-col h-full bg-white relative">
            {/* 1. Header: Space & Tab Selector */}
            <div className="px-4 py-2 border-b border-gray-50 bg-white z-10 sticky top-0 space-y-2">
                {/* Space Selector (Micro) */}
                <div className="flex justify-end">
                    <div className="flex items-center gap-1 text-[10px] text-gray-400 bg-gray-50 px-2 py-0.5 rounded-full">
                        <FolderOpen className="h-3 w-3" />
                        <select
                            value={selectedSpace}
                            onChange={(e) => handleSpaceChange(e.target.value)}
                            className="bg-transparent font-medium text-gray-600 focus:outline-none cursor-pointer hover:text-teal-600"
                        >
                            <option value="">默认空间</option>
                            {spaces.filter(s => s.title !== '默认空间').map(s => (
                                <option key={s._id || s.id} value={s._id || s.id}>{s.title}</option>
                            ))}
                        </select>
                    </div>
                </div>

                {/* Tabs */}
                <div className="flex p-1 bg-gray-100/50 rounded-lg">
                    {['page', 'link', 'image'].map((m) => (
                        <button
                            key={m}
                            onClick={() => setMode(m as any)}
                            className={`flex-1 py-1.5 text-xs font-medium rounded-md transition-all ${mode === m
                                ? 'bg-white text-teal-600 shadow-sm'
                                : 'text-gray-500 hover:text-gray-700'
                                }`}
                        >
                            {m === 'page' ? '网页全文' : m === 'link' ? '链接解析' : '图片提取'}
                        </button>
                    ))}
                </div>
            </div>

            {/* 2. Main Content Area */}
            <div className="flex-1 overflow-y-auto scrollbar-thin p-4">

                {/* --- Web Page Mode --- */}
                {mode === 'page' && (
                    <div className="space-y-4">
                        {!content ? (
                            <div className="flex flex-col items-center justify-center py-8 space-y-4 opacity-70">
                                <div className="p-4 bg-teal-50 rounded-full text-teal-500">
                                    <Download className="h-6 w-6" />
                                </div>
                                <button
                                    onClick={handleClip}
                                    disabled={loading}
                                    className="px-6 py-2 bg-teal-600 text-white rounded-full text-sm font-medium hover:bg-teal-700 transition-shadow shadow-md hover:shadow-lg disabled:opacity-50"
                                >
                                    {loading ? '提取中...' : '一键提取全文'}
                                </button>
                                <p className="text-[10px] text-gray-400 text-center max-w-[200px]">
                                    自动提取当前网页的正文内容、图片和链接
                                </p>
                            </div>
                        ) : (
                            <div className="space-y-4 animate-in fade-in slide-in-from-bottom-2">
                                <input
                                    type="text"
                                    value={title}
                                    onChange={(e) => setTitle(e.target.value)}
                                    className="w-full text-lg font-bold text-gray-800 placeholder:text-gray-300 border-none focus:ring-0 px-0 py-1 bg-transparent"
                                    placeholder="标题"
                                />
                                <div className="flex items-center gap-4 text-[10px] text-gray-400">
                                    <span>{stats.words} 字</span>
                                    <span>{stats.images} 图</span>
                                </div>
                                <textarea
                                    value={content}
                                    onChange={(e) => handleContentChange(e.target.value)}
                                    className="w-full text-sm leading-relaxed text-gray-600 placeholder:text-gray-300 border-none focus:ring-0 px-0 py-0 bg-transparent min-h-[300px] resize-none font-serif"
                                    placeholder="正文内容..."
                                />
                                <div className="flex items-center gap-2 pt-2 border-t border-gray-50">
                                    <label className="flex items-center gap-1.5 text-xs text-gray-500 cursor-pointer hover:text-teal-600">
                                        <input type="checkbox" checked={saveUrl} onChange={(e) => setSaveUrl(e.target.checked)} className="rounded border-gray-300 text-teal-600 focus:ring-teal-500" />
                                        保存来源链接
                                    </label>
                                </div>
                            </div>
                        )}
                    </div>
                )}

                {mode === 'link' && (
                    <div className="space-y-4 pt-4">
                        <div className="space-y-2">
                            <label className="text-xs font-medium text-gray-500">链接地址</label>
                            <div className="flex gap-2">
                                <input
                                    type="url"
                                    value={dataUrl}
                                    onChange={(e) => setDataUrl(e.target.value)}
                                    placeholder="https://example.com/article"
                                    className="flex-1 h-9 rounded-lg border border-gray-200 bg-gray-50 px-3 text-sm focus:border-teal-500 focus:ring-1 focus:ring-teal-500 outline-none font-mono text-xs"
                                />
                                <button
                                    onClick={handleParseLink}
                                    disabled={loading}
                                    className="px-4 h-9 bg-teal-50 text-teal-600 text-xs font-medium rounded-lg hover:bg-teal-100 transition-colors flex items-center gap-1"
                                >
                                    {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                                    解析
                                </button>
                            </div>
                        </div>

                        {/* Editor for Parsed Content (Same as Page Mode) */}
                        {content ? (
                            <div className="space-y-4 animate-in fade-in slide-in-from-bottom-2 border-t border-gray-50 pt-4">
                                <input
                                    type="text"
                                    value={title}
                                    onChange={(e) => setTitle(e.target.value)}
                                    className="w-full text-lg font-bold text-gray-800 placeholder:text-gray-300 border-none focus:ring-0 px-0 py-1 bg-transparent"
                                    placeholder="标题"
                                />
                                <div className="flex items-center gap-4 text-[10px] text-gray-400">
                                    <span>{stats.words} 字</span>
                                    <span className="text-teal-500">已解析内容</span>
                                </div>
                                <textarea
                                    value={content}
                                    onChange={(e) => handleContentChange(e.target.value)}
                                    className="w-full text-sm leading-relaxed text-gray-600 placeholder:text-gray-300 border-none focus:ring-0 px-0 py-0 bg-transparent min-h-[300px] resize-none font-serif"
                                    placeholder="解析的内容..."
                                />
                            </div>
                        ) : (
                            <div className="text-center py-8 text-gray-300 text-xs">
                                <LinkIcon className="h-8 w-8 mx-auto mb-2 opacity-20" />
                                <p>输入链接点击解析，将自动提取纯文本内容</p>
                            </div>
                        )}
                    </div>
                )}

                {/* --- Image Mode --- */}
                {mode === 'image' && (
                    <div className="space-y-4">
                        {/* 标题输入框 */}
                        <div className="space-y-2">
                            <label className="text-xs font-medium text-gray-500">卡片标题</label>
                            <input
                                type="text"
                                value={title}
                                onChange={(e) => setTitle(e.target.value)}
                                placeholder="输入标题（可选，留空将使用当前时间）"
                                className="w-full h-9 rounded-lg border border-gray-200 bg-gray-50 px-3 text-sm focus:border-teal-500 focus:ring-1 focus:ring-teal-500 outline-none"
                            />
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                            <button
                                onClick={handleFetchPageImages}
                                disabled={loading}
                                className="flex flex-col items-center justify-center p-4 rounded-xl border border-dashed border-gray-200 hover:border-teal-400 hover:bg-teal-50 transition-all gap-2 text-gray-500 hover:text-teal-600"
                            >
                                {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : <LinkIcon className="h-5 w-5" />}
                                <span className="text-xs font-medium">抓取网页图片</span>
                            </button>
                            <button
                                onClick={handlePasteImage}
                                className="flex flex-col items-center justify-center p-4 rounded-xl border border-dashed border-gray-200 hover:border-teal-400 hover:bg-teal-50 transition-all gap-2 text-gray-500 hover:text-teal-600"
                            >
                                <Paperclip className="h-5 w-5" />
                                <span className="text-xs font-medium">粘贴剪贴板图片</span>
                            </button>
                        </div>

                        {/* Image Grid */}
                        {pageImages.length > 0 && (
                            <div className="grid grid-cols-3 gap-2 animate-in fade-in">
                                {pageImages.map((img, idx) => (
                                    <div
                                        key={idx}
                                        onClick={() => toggleImageSelection(idx)}
                                        className={`relative aspect-square rounded-lg overflow-hidden cursor-pointer border-2 transition-all ${img.selected ? 'border-teal-500 ring-2 ring-teal-200' : 'border-transparent hover:border-gray-200'
                                            }`}
                                    >
                                        <img src={img.src} alt="img" className="w-full h-full object-cover" />
                                        {img.selected && (
                                            <div className="absolute top-1 right-1 bg-teal-500 text-white rounded-full p-0.5">
                                                <Check className="h-3 w-3" />
                                            </div>
                                        )}
                                    </div>
                                ))}
                            </div>
                        )}
                        {pageImages.length > 0 && (
                            <p className="text-[10px] text-gray-400 text-center">
                                已选择 {pageImages.filter(i => i.selected).length} 张
                            </p>
                        )}

                        {/* ImgBB Upload Notice */}
                        <div className="mt-2 p-2 bg-teal-50 border border-teal-100 rounded-lg text-teal-700 text-[10px] text-center">
                            💡 剪贴板图片将通过 imgbb 上传为永久链接后保存到写拉松。
                        </div>
                    </div>
                )}

                {/* Error Message */}
                {error && (
                    <div className="mt-4 p-3 bg-red-50 text-red-600 text-xs rounded-lg border border-red-100 flex items-center gap-2">
                        <span className="w-1.5 h-1.5 bg-red-400 rounded-full" />
                        {error}
                    </div>
                )}
            </div>

            {/* 3. Bottom Toolbar */}
            <div className="p-4 border-t border-gray-50 bg-white z-20">
                <button
                    onClick={handleSave}
                    disabled={sending || (mode === 'page' && !content) || (mode === 'image' && !pageImages.some(i => i.selected))}
                    className={`w-full flex items-center justify-center gap-2 px-6 py-2.5 rounded-full font-medium text-sm transition-all shadow-sm ${status === 'success'
                        ? 'bg-green-600 text-white shadow-green-200'
                        : 'bg-teal-600 hover:bg-teal-700 text-white shadow-teal-200 hover:shadow-teal-300'
                        } disabled:opacity-50 disabled:shadow-none disabled:cursor-not-allowed`}
                >
                    {sending ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                    ) : status === 'success' ? (
                        <>
                            <Check className="h-4 w-4" />
                            <span className="font-bold">保存成功</span>
                        </>
                    ) : (
                        <>
                            <Send className="h-4 w-4" />
                            <span>保存到写拉松</span>
                        </>
                    )}
                </button>
            </div>
        </div>
    );
};

export default Clipper;
