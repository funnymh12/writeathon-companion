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

            // Link Mode handling
            if (mode === 'link') {
                if (!dataUrl) { setError('请输入 URLs'); setSending(false); return; }
                finalTitle = title || '网页链接';
                finalContent = `[${title || dataUrl}](${dataUrl})\n\n> 链接剪藏`;
            }

            // Image Mode handling
            if (mode === 'image') {
                const selectedCount = pageImages.filter(i => i.selected).length;
                if (selectedCount === 0) { setError('请选择至少一张图片'); setSending(false); return; }
                finalTitle = `图片剪藏 (${selectedCount}张)`;
                finalContent = `本次剪藏了 ${selectedCount} 张图片，请查看附件。`;
            }

            const MAX_CHUNK_SIZE = 4500;
            const chunks = mode === 'page' ? splitContent(finalContent, MAX_CHUNK_SIZE) : [finalContent];
            const totalChunks = chunks.length;
            const cardTitle = finalTitle.trim() || `剪藏 ${new Date().toLocaleString('zh-CN')}`;

            for (let i = 0; i < chunks.length; i++) {
                let chunkContent = chunks[i];

                if (mode === 'page' && totalChunks > 1) {
                    chunkContent = `**[${i + 1}/${totalChunks}]**\n\n${chunkContent}`;
                }

                // Add source URL if Page Mode
                if (mode === 'page' && i === 0 && saveUrl && sourceUrl) {
                    chunkContent += `\n\n> Source: [${sourceUrl}](${sourceUrl})`;
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

                {/* --- Link Mode --- */}
                {mode === 'link' && (
                    <div className="space-y-4 pt-4">
                        <div className="space-y-2">
                            <label className="text-xs font-medium text-gray-500">链接地址</label>
                            <div className="flex gap-2">
                                <input
                                    type="url"
                                    value={dataUrl}
                                    onChange={(e) => setDataUrl(e.target.value)}
                                    placeholder="https://..."
                                    className="flex-1 h-9 rounded-lg border border-gray-200 bg-gray-50 px-3 text-sm focus:border-teal-500 focus:ring-1 focus:ring-teal-500 outline-none"
                                />
                                <button
                                    onClick={() => {/* Mock Parse */ setTitle('解析的链接标题'); }}
                                    className="px-3 h-9 bg-gray-100 text-gray-600 text-xs rounded-lg hover:bg-gray-200"
                                    title="自动获取标题(模拟)"
                                >
                                    解析
                                </button>
                            </div>
                        </div>
                        <div className="space-y-2">
                            <label className="text-xs font-medium text-gray-500">标题/备注</label>
                            <input
                                type="text"
                                value={title}
                                onChange={(e) => setTitle(e.target.value)}
                                placeholder="输入标题..."
                                className="w-full h-9 rounded-lg border border-gray-200 bg-gray-50 px-3 text-sm focus:border-teal-500 focus:ring-1 focus:ring-teal-500 outline-none"
                            />
                        </div>
                    </div>
                )}

                {/* --- Image Mode --- */}
                {mode === 'image' && (
                    <div className="space-y-4">
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
