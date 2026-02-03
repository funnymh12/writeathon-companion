import React, { useState, useEffect } from 'react';
import { WriteathonClient, Space } from '../utils/api';
import { storage } from '../utils/storage';
import { uploadImage } from '../utils/imageUtils';
import { Loader2, Check, Scissors, Link as LinkIcon, Image as ImageIcon, FileText, ChevronDown, CheckCircle2, Cloud, ExternalLink, X, RotateCw } from 'lucide-react';

type ClipMode = 'page' | 'link' | 'image';

interface ScrapedImage {
    src: string;
    alt?: string;
    width: number;
    height: number;
}

const Clipper: React.FC = () => {
    const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
    const [message, setMessage] = useState('');
    const [spaces, setSpaces] = useState<Space[]>([]);
    const [selectedSpace, setSelectedSpace] = useState('');
    const [mode, setMode] = useState<ClipMode>('page');

    // Page/Link Content
    const [title, setTitle] = useState('');
    const [content, setContent] = useState('');
    const [url, setUrl] = useState('');

    // Image Content
    const [images, setImages] = useState<ScrapedImage[]>([]);
    const [selectedImages, setSelectedImages] = useState<Set<string>>(new Set());
    const [viewFullImage, setViewFullImage] = useState<string | null>(null);

    useEffect(() => {
        fetchSpaces();
        getCurrentTab();
        // Default to loading page content
        scrapePageContent();
    }, []);

    useEffect(() => {
        handleRefresh();
    }, [mode]);

    const handleRefresh = () => {
        if (mode === 'image') {
            scrapeImages();
        } else if (mode === 'page') {
            scrapePageContent();
        } else if (mode === 'link') {
            scrapeLinkInfo();
        }
    };

    const fetchSpaces = async () => {
        try {
            const data = await storage.get();
            if (data.token && data.userId) {
                const client = new WriteathonClient(data.token, data.userId);
                const response = await client.getSpaces();
                if (response.success && response.data) {
                    setSpaces(response.data);
                    const savedSpaceId = data.selectedSpaceId;
                    if (savedSpaceId && response.data.find(s => (s._id || s.id) === savedSpaceId)) {
                        setSelectedSpace(savedSpaceId);
                    } else if (response.data.length > 0) {
                        setSelectedSpace(response.data[0]._id || response.data[0].id);
                    }
                }
            }
        } catch (err) {
            console.error('Failed to fetch spaces', err);
        }
    };

    const handleSpaceChange = async (spaceId: string) => {
        setSelectedSpace(spaceId);
        const spaceName = spaces.find(s => (s._id || s.id) === spaceId)?.title || '默认空间';
        await storage.set({ selectedSpaceId: spaceId, selectedSpaceName: spaceName });
    };

    const getCurrentTab = async () => {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (tab && tab.url && tab.title) {
            setTitle(tab.title);
            setUrl(tab.url);
        }
    };

    const scrapePageContent = async () => {
        setStatus('loading');
        try {
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            if (!tab?.id || tab.url?.startsWith('chrome://')) {
                setStatus('idle');
                return;
            }

            const results = await chrome.scripting.executeScript({
                target: { tabId: tab.id },
                func: () => {
                    const clone = document.cloneNode(true) as Document;
                    const selection = window.getSelection();
                    if (selection && selection.toString().trim()) {
                        return selection.toString().trim();
                    }

                    // Fallback to extraction (simplified)
                    clone.querySelectorAll('script, style, nav, footer, iframe, header, aside').forEach(e => e.remove());
                    const article = clone.querySelector('article') || clone.querySelector('main') || clone.querySelector('.content') || clone.body;
                    return article.innerText.substring(0, 5000);
                }
            });

            if (results && results[0]) {
                setContent(results[0].result as string);
            }
            setStatus('idle');
        } catch (err) {
            console.error('Scrape failed', err);
            setStatus('idle');
        }
    };

    const scrapeLinkInfo = async () => {
        await getCurrentTab();
        setContent('');
    };

    const scrapeImages = async () => {
        setStatus('loading');
        try {
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            if (!tab?.id || tab.url?.startsWith('chrome://')) return;

            const results = await chrome.scripting.executeScript({
                target: { tabId: tab.id },
                func: () => {
                    const imgs = Array.from(document.querySelectorAll('img'));
                    return imgs
                        .map(img => ({
                            src: img.src,
                            alt: img.alt,
                            width: img.naturalWidth,
                            height: img.naturalHeight
                        }))
                        .filter(img => img.width > 200 && img.height > 200)
                        .slice(0, 50);
                }
            });

            if (results && results[0]) {
                setImages(results[0].result || []);
            }
            setStatus('idle');
        } catch (err) {
            console.error('Image scrape failed', err);
            setStatus('idle');
        }
    };

    const toggleImageSelection = (src: string) => {
        const newSet = new Set(selectedImages);
        if (newSet.has(src)) {
            newSet.delete(src);
        } else {
            newSet.add(src);
        }
        setSelectedImages(newSet);
    };

    const isLikelyHotlinked = (url: string) => {
        return url.includes('wx_fmt=') || url.includes('wxfrom=') || url.includes('tp=webp');
    };

    // uploadToImgbb is now imported from utils/imageUtils

    const fetchImageAsBase64 = async (url: string) => {
        const response = await fetch(url);
        const blob = await response.blob();
        return new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result as string);
            reader.onerror = reject;
            reader.readAsDataURL(blob);
        });
    };

    const checkImageAccessible = async (url: string) => {
        try {
            const res = await fetch(url, { method: 'HEAD' });
            return res.ok;
        } catch {
            return false;
        }
    };


    const handleSave = async () => {
        setStatus('loading');
        setMessage('');

        try {
            const data = await storage.get();
            if (!data.token || !data.userId) {
                setStatus('error');
                setMessage('请先登录');
                return;
            }

            const client = new WriteathonClient(data.token, data.userId);

            if (mode === 'page') {
                const MAX_CHUNK = 4000;
                const chunks = [];
                let remain = content;
                while (remain.length > 0) {
                    chunks.push(remain.substring(0, MAX_CHUNK));
                    remain = remain.substring(MAX_CHUNK);
                }

                let firstBody = chunks[0] + `\n\n> 来源: [${title}](${url})`;

                const res = await client.createCard({
                    title: title,
                    content: firstBody,
                    space: selectedSpace || undefined
                });

                if (!res.success) throw new Error(res.message);

                if (chunks.length > 1) {
                    const parentId = res.data?.id || res.data?._id;
                    if (parentId) {
                        for (let i = 1; i < chunks.length; i++) {
                            // Use extendCard to append to the parent card
                            await client.extendCard(parentId, chunks[i], `${title} (${i + 1})`);
                        }
                    }
                }

            } else if (mode === 'link') {
                const linkContent = `> [${title}](${url})\n\n${content}`;
                const res = await client.createCard({
                    title: '收藏链接: ' + title,
                    content: linkContent,
                    space: selectedSpace || undefined
                });
                if (!res.success) throw new Error(res.message);

            } else if (mode === 'image') {
                if (selectedImages.size === 0) {
                    throw new Error('请至少选择一张图片');
                }

                let processedImagesMd = '';
                // No longer needed here as utils handles default key if missing, but we can pass null or let utility handle it.
                // The utility reads storage itself. But here we might want to iterate. 
                // Wait, utility uploadToImgbb does read storage.

                let successCount = 0;
                for (const src of Array.from(selectedImages)) {
                    try {
                        let finalSrc = src;
                        const needsProxy = isLikelyHotlinked(src) || !(await checkImageAccessible(src));

                        if (needsProxy) {
                            try {
                                const base64 = await fetchImageAsBase64(src);
                                // Use imported utility
                                finalSrc = await uploadImage(base64);
                            } catch (e) {
                                console.warn('ImgBB upload failed, falling back to original', e);
                            }
                        }

                        processedImagesMd += `![](${finalSrc})\n\n`;
                        successCount++;
                    } catch (e) {
                        console.error('Image process failed', e);
                    }
                }

                if (successCount === 0) throw new Error('图片处理失败');

                const res = await client.createCard({
                    title: `图片收藏: ${title}`,
                    content: processedImagesMd + `> 来源: [${title}](${url})`,
                    space: selectedSpace || undefined
                });

                if (!res.success) throw new Error(res.message);
            }

            setStatus('success');
            setTimeout(() => setStatus('idle'), 3000);

        } catch (err: any) {
            setStatus('error');
            setMessage(err.message || '保存失败');
        }
    };

    return (
        <div className="flex flex-col h-full bg-white relative">
            {/* Top Bar: Space & Mode */}
            <div className="px-4 py-3 flex items-center justify-between bg-white z-10 border-b border-gray-50/50">
                {/* Mode Switcher - Pill Style */}
                <div className="flex p-0.5 bg-gray-100/80 rounded-lg">
                    <button
                        onClick={() => setMode('page')}
                        className={`px-2.5 py-1.5 rounded-md text-[10px] font-bold transition-all flex items-center gap-1.5 ${mode === 'page'
                            ? 'bg-white text-teal-600 shadow-sm'
                            : 'text-gray-400 hover:text-gray-600'
                            }`}
                    >
                        <FileText className="h-3 w-3" />
                        全文
                    </button>
                    <button
                        onClick={() => setMode('link')}
                        className={`px-2.5 py-1.5 rounded-md text-[10px] font-bold transition-all flex items-center gap-1.5 ${mode === 'link'
                            ? 'bg-white text-teal-600 shadow-sm'
                            : 'text-gray-400 hover:text-gray-600'
                            }`}
                    >
                        <LinkIcon className="h-3 w-3" />
                        链接
                    </button>
                    <button
                        onClick={() => setMode('image')}
                        className={`px-2.5 py-1.5 rounded-md text-[10px] font-bold transition-all flex items-center gap-1.5 ${mode === 'image'
                            ? 'bg-white text-teal-600 shadow-sm'
                            : 'text-gray-400 hover:text-gray-600'
                            }`}
                    >
                        <ImageIcon className="h-3 w-3" />
                        图片
                    </button>
                </div>

                {/* Right Side: Refresh & Space */}
                <div className="flex items-center gap-1">
                    <button
                        onClick={handleRefresh}
                        className="p-1.5 text-gray-400 hover:text-teal-600 hover:bg-teal-50 rounded-lg transition-colors"
                        title="刷新内容"
                    >
                        <RotateCw className={`h-3.5 w-3.5 ${status === 'loading' ? 'animate-spin' : ''}`} />
                    </button>

                    <div className="relative group">
                        <select
                            value={selectedSpace}
                            onChange={(e) => handleSpaceChange(e.target.value)}
                            className="bg-transparent font-medium text-xs text-gray-500 focus:outline-none cursor-pointer hover:text-teal-600 transition-colors py-1 pr-4 pl-1 appearance-none text-right max-w-[80px] truncate"
                        >
                            {spaces.map((space) => (
                                <option key={space._id || space.id} value={space._id || space.id}>
                                    {space.title}
                                </option>
                            ))}
                        </select>
                        <ChevronDown className="absolute right-0 top-1/2 -translate-y-1/2 h-3 w-3 text-gray-400 pointer-events-none group-hover:text-teal-500 transition-colors" />
                    </div>
                </div>
            </div>

            {/* Main Content Area */}
            <div className="flex-1 overflow-y-auto bg-gray-50/30">
                {mode === 'page' && (
                    <div className="p-5 space-y-4 max-w-2xl mx-auto">
                        <div className="relative">
                            <input
                                type="text"
                                value={title}
                                onChange={(e) => setTitle(e.target.value)}
                                className="w-full text-base font-bold text-gray-800 bg-transparent border-none placeholder-gray-300 focus:ring-0 p-0"
                                placeholder="标题..."
                            />
                        </div>
                        <div className="relative group">
                            <textarea
                                value={content}
                                onChange={(e) => setContent(e.target.value)}
                                className="w-full h-[360px] text-sm leading-7 text-gray-600 bg-white border border-gray-100 rounded-xl p-4 focus:ring-1 focus:ring-teal-100 focus:border-teal-200 resize-none font-serif shadow-sm scrollbar-thin outline-none"
                                placeholder="页面内容..."
                            />
                            <div className="absolute bottom-4 right-4 text-[10px] text-gray-300 bg-white/80 backdrop-blur px-2 py-1 rounded-full border border-gray-100">
                                {content.length} 字
                            </div>
                        </div>
                    </div>
                )}

                {mode === 'link' && (
                    <div className="p-5 h-full flex flex-col items-center justify-center">
                        <div className="w-full max-w-sm bg-white rounded-2xl border border-gray-100 shadow-[0_8px_30px_-12px_rgba(0,0,0,0.1)] overflow-hidden">
                            <div className="h-24 bg-gradient-to-br from-teal-50 to-emerald-50 flex items-center justify-center">
                                <LinkIcon className="h-8 w-8 text-teal-200" />
                            </div>
                            <div className="p-5 space-y-3">
                                <h3 className="text-sm font-bold text-gray-800 line-clamp-2 leading-tight">
                                    {title}
                                </h3>
                                <div className="text-xs text-blue-500 flex items-center gap-1 bg-blue-50 w-fit px-2 py-1 rounded-md">
                                    <ExternalLink className="h-3 w-3" />
                                    <span className="truncate max-w-[200px]">{url}</span>
                                </div>
                                <textarea
                                    value={content}
                                    onChange={(e) => setContent(e.target.value)}
                                    placeholder="添加备注 (可选)..."
                                    className="w-full text-xs text-gray-600 bg-gray-50/50 border border-gray-100 rounded-lg p-3 focus:outline-none focus:border-teal-200 resize-none h-20 mt-2"
                                />
                            </div>
                        </div>
                    </div>
                )}

                {mode === 'image' && (
                    <div className="p-1">
                        {status === 'loading' && images.length === 0 ? (
                            <div className="flex items-center justify-center h-64">
                                <Loader2 className="h-6 w-6 animate-spin text-gray-300" />
                            </div>
                        ) : images.length === 0 ? (
                            <div className="flex flex-col items-center justify-center h-64 text-gray-300">
                                <ImageIcon className="h-8 w-8 opacity-20 mb-2" />
                                <span className="text-xs">未找到大图</span>
                            </div>
                        ) : (
                            <div className="grid grid-cols-2 gap-1 pb-20">
                                {images.map((img, idx) => (
                                    <div
                                        key={idx}
                                        onClick={() => toggleImageSelection(img.src)}
                                        className={`relative group aspect-square cursor-pointer overflow-hidden rounded-lg transition-all border-2 ${selectedImages.has(img.src)
                                            ? 'border-teal-500 filter-none'
                                            : 'border-transparent border-white hover:border-teal-200'
                                            }`}
                                    >
                                        <img
                                            src={img.src}
                                            alt={img.alt}
                                            className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                                            loading="lazy"
                                        />
                                        <div className={`absolute top-2 right-2 rounded-full p-1 transition-all ${selectedImages.has(img.src) ? 'bg-teal-500 text-white shadow-md' : 'bg-black/20 text-white/50 group-hover:bg-black/40'}`}>
                                            <Check className="h-3 w-3" />
                                        </div>
                                        <button
                                            onClick={(e) => { e.stopPropagation(); setViewFullImage(img.src); }}
                                            className="absolute bottom-2 right-2 p-1.5 bg-black/50 backdrop-blur rounded-lg text-white opacity-0 group-hover:opacity-100 transition-opacity"
                                        >
                                            <ExternalLink className="h-3 w-3" />
                                        </button>
                                        <div className="absolute bottom-2 left-2 px-1.5 py-0.5 bg-black/40 backdrop-blur rounded text-[9px] text-white font-mono opacity-0 group-hover:opacity-100 transition-opacity">
                                            {img.width}x{img.height}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* Bottom Toolbar */}
            <div className="px-5 py-4 border-t border-gray-50 flex items-center justify-between bg-white z-20">
                <div className="text-[10px] text-gray-400 font-medium">
                    {status === 'error' ? (
                        <span className="text-red-500 flex items-center gap-1.5">
                            <X className="h-3 w-3" /> {message || '保存失败'}
                        </span>
                    ) : status === 'success' ? (
                        <span className="text-green-600 flex items-center gap-1.5">
                            <CheckCircle2 className="h-3 w-3" /> 保存成功
                        </span>
                    ) : mode === 'image' ? (
                        <span>已选 {selectedImages.size} 张图片</span>
                    ) : (
                        <span>保存到 Writeathon</span>
                    )}
                </div>

                <button
                    onClick={handleSave}
                    disabled={status === 'loading' || (mode === 'image' && selectedImages.size === 0)}
                    className={`flex items-center gap-2 px-5 py-2.5 rounded-full font-bold text-sm transition-all shadow-md hover:shadow-lg disabled:opacity-50 disabled:shadow-none ${status === 'success'
                        ? 'bg-green-500 text-white'
                        : 'bg-teal-500 hover:bg-teal-600 text-white shadow-teal-500/30'
                        }`}
                >
                    {status === 'loading' ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                    ) : status === 'success' ? (
                        <>
                            <Check className="h-4 w-4" />
                            <span>已保存</span>
                        </>
                    ) : (
                        <>
                            <Cloud className="h-4 w-4" />
                            <span>保存{mode === 'image' && selectedImages.size > 0 ? ` (${selectedImages.size})` : ''}</span>
                        </>
                    )}
                </button>
            </div>

            {/* Full Image Modal */}
            {viewFullImage && (
                <div className="fixed inset-0 z-50 bg-black/90 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200">
                    <button
                        onClick={() => setViewFullImage(null)}
                        className="absolute top-4 right-4 p-2 text-white/50 hover:text-white transition-colors"
                    >
                        <X className="h-6 w-6" />
                    </button>
                    <img
                        src={viewFullImage}
                        className="max-w-full max-h-full rounded shadow-2xl"
                        alt="Preview"
                    />
                </div>
            )}
        </div>
    );
};

export default Clipper;
