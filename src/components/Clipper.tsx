import React, { useState, useEffect } from 'react';
import { WriteathonClient, Space } from '../utils/api';
import { storage } from '../utils/storage';
import { uploadImage } from '../utils/imageUtils';
import { formatLogFooter } from '../utils/textUtils';
import { Loader2, Check, Scissors, Link as LinkIcon, Image as ImageIcon, FileText, ChevronDown, CheckCircle2, Cloud, ExternalLink, X, RotateCw, Globe } from 'lucide-react';

type ClipMode = 'article' | 'image';

interface ScrapedImage {
    src: string;
    alt?: string;
    width: number;
    height: number;
}

import { parseContent } from '../utils/content-parser';

const Clipper: React.FC = () => {
    const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
    const [message, setMessage] = useState('');
    const [spaces, setSpaces] = useState<Space[]>([]);
    const [selectedSpace, setSelectedSpace] = useState('');
    const [mode, setMode] = useState<ClipMode>('article');

    // Page/Article Content
    const [title, setTitle] = useState('');
    const [sourceTitle, setSourceTitle] = useState('');
    const [content, setContent] = useState('');
    const [url, setUrl] = useState('');
    const [currentTabUrl, setCurrentTabUrl] = useState(''); // To track if we are on the current tab

    // Image Content
    const [images, setImages] = useState<ScrapedImage[]>([]);
    const [selectedImages, setSelectedImages] = useState<Set<string>>(new Set());
    const [viewFullImage, setViewFullImage] = useState<string | null>(null);

    // Estimation
    const [estimatedCards, setEstimatedCards] = useState(1);

    useEffect(() => {
        // Calculate estimation
        const est = Math.ceil(content.length / 3800) || 1;
        setEstimatedCards(est);
    }, [content]);

    useEffect(() => {
        fetchSpaces();
        getCurrentTab();
        // Default to loading page content
        scrapePageContent();
    }, []);

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

    // Helpers
    const isLikelyHotlinked = (url: string) => {
        return url.includes('wx_fmt=') || url.includes('wxfrom=') || url.includes('tp=webp');
    };

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

    const toggleImageSelection = (src: string) => {
        const newSet = new Set(selectedImages);
        if (newSet.has(src)) {
            newSet.delete(src);
        } else {
            newSet.add(src);
        }
        setSelectedImages(newSet);
    };

    const getCurrentTab = async () => {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (tab && tab.url && tab.title) {
            setSourceTitle(tab.title);
            setUrl(tab.url);
            setCurrentTabUrl(tab.url);
        }
    };


    const scrapeExternalUrl = async (targetUrl: string) => {
        setStatus('loading');
        setMessage('正在解析外部链接...');
        try {
            const res = await fetch(targetUrl);
            if (!res.ok) throw new Error(`Fetch failed: ${res.status}`);
            const html = await res.text();

            // Use the unified processing logic
            const markdown = await processHtmlToMarkdown(html, targetUrl);
            setContent(markdown);

            // Try to extract title from the fetched HTML if needed, 
            // but processHtmlToMarkdown already returns the MD.
            // Let's at least try to update the title if it's empty.
            if (!sourceTitle) {
                const parser = new DOMParser();
                const doc = parser.parseFromString(html, 'text/html');
                if (doc.title) setSourceTitle(doc.title);
            }

            setStatus('idle');
            setMessage('');
        } catch (e: any) {
            console.error('External scrape failed', e);
            setStatus('error');
            setMessage(`解析失败: ${e.message}`);
        }
    };

    // Advanced Clipping Logic
    const scrapePageContent = async () => {
        setStatus('loading');
        setMessage('正在解析当前页面...');
        try {
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            if (!tab?.id || tab.url?.startsWith('chrome://')) {
                setStatus('idle');
                setMessage('无法解析此页面');
                return;
            }

            // 1. Get filtered HTML from the tab
            const results = await chrome.scripting.executeScript({
                target: { tabId: tab.id },
                func: () => {
                    // Pre-cleanup in tab context
                    const clone = document.cloneNode(true) as Document;

                    // Force clean WeChat/Common junk early
                    const knownJunk = [
                        '#js_pc_qr_code', '.qr_code_pc_outer', // WeChat QR
                        '.rich_media_area_extra', '#js_sponsor_ad_area', '.reward_area', // WeChat Reward
                        '.like_comment_share_area', // WeChat Like
                        '.related_answer_list', '.Question-sideColumn', // Zhihu
                        '.recommend-box', '.login-mark', // CSDN
                        'script', 'style', 'noscript', 'iframe', 'svg', 'button', 'input', 'textarea'
                    ];

                    knownJunk.forEach(sel => {
                        clone.querySelectorAll(sel).forEach(el => el.remove());
                    });

                    // Resolve lazy loaded images
                    clone.querySelectorAll('img').forEach(img => {
                        if (img.dataset.src) img.src = img.dataset.src;
                        if (img.dataset.original) img.src = img.dataset.original;
                    });

                    // Fix Absolute URLs
                    clone.querySelectorAll('a').forEach(a => { try { a.href = a.href; } catch { } });
                    clone.querySelectorAll('img').forEach(img => { try { img.src = img.src; } catch { } });

                    return clone.documentElement.outerHTML;
                }
            });

            if (results && results[0]) {
                const html = results[0].result as string;
                // 2. Process in Side Panel
                const markdown = await processHtmlToMarkdown(html, tab.url || '');
                setContent(markdown);

                if (tab.title) setSourceTitle(tab.title);
            }
            setStatus('idle');
            setMessage('');
        } catch (err: any) {
            console.error('Scrape failed', err);
            setStatus('error');
            setMessage(`解析失败: ${err.message || '未知错误'}`);
        }
    };

    const processHtmlToMarkdown = async (html: string, baseUrl: string): Promise<string> => {
        let markdown = await parseContent(html, baseUrl);

        // 2.3 Powerful Post-Processing (Regex)
        markdown = cleanMarkdown(markdown);

        return markdown;
    };

    const cleanMarkdown = (markdown: string): string => {
        let md = markdown;

        // 1. Loading and Maintenance States
        // Pattern: Matches short lines indicating loading/empty/error states
        md = md.replace(/^.*?(?:loading|加载中|waiting|processing|名称已清空).*?$/gim, (match) => {
            return match.length < 30 ? '' : match;
        });

        // 2. Social Meta and Interactions (Pattern based)
        const socialPatterns = [
            // Likes/Views/Comments with numbers
            /^(?:阅读|Read|Views)\s*\d+/im,
            /^\d+\s*(?:likes|comments|shares|人?喜欢|人?在看|条?评论|点赞)/im,
            // QR Codes/Subscriptions
            /^(?:微信)?扫一扫.*?$/im,
            /^(?:关注|订阅|Subscribe).*?$/im,
            // Date/Modification lines
            /^(?:Modified|修改于|Published|发布于)\s+\d{4}[-/]\d{2}[-/]\d{2}/im
        ];

        socialPatterns.forEach(pat => {
            md = md.replace(pat, ' ');
        });

        // 3. Specific Noise Phrases (Short phrases often found in footers)
        const phrases = [
            '赞赏作者', '轻点两下取消赞', '喜欢作者',
            '点击上方', '蓝色字体', '关注我们'
        ];
        phrases.forEach(p => {
            // Remove line if it starts with the phrase
            md = md.replace(new RegExp(`^.*?${p}.*?$`, 'gm'), '');
        });

        // 4. Formatting Cleanup
        // Empty Bold/Italic
        md = md.replace(/\*\*\s*\*\*/g, '');
        md = md.replace(/\*\s*\*/g, '');

        // Empty Links `[](url)` or `[text]()` or `[]()`
        md = md.replace(/\[\s*\]\(.*?\)/g, '');

        // Base64 Images
        md = md.replace(/!\[.*?\]\(data:image.*?\)/g, '');

        // 5. Excessive Newlines
        md = md.replace(/\n{3,}/g, '\n\n').trim();

        return md;
    };

    const scrapeImages = async () => {
        setStatus('loading');
        setMessage('正在提取图片...');
        try {
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            if (!tab?.id || tab.url?.startsWith('chrome://')) {
                setStatus('idle');
                setMessage('无法提取此页面图片');
                return;
            }

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
            setMessage('');
        } catch (err) {
            console.error('Image scrape failed', err);
            setStatus('error');
            setMessage('提取图片失败');
        }
    };

    // Handle Refresh / Parse
    const handleRefresh = async () => {
        setMessage('');
        if (mode === 'image') {
            scrapeImages();
        } else if (mode === 'article') {
            // Check if URL is current tab
            if (url === currentTabUrl || url.trim() === '') {
                scrapePageContent();
            } else {
                // External URL
                await scrapeExternalUrl(url);
            }
        }
    };

    // Auto-refresh on mode change
    useEffect(() => {
        handleRefresh();
    }, [mode]);

    const processContentImages = async (markdown: string): Promise<string> => {
        // Find all images ![alt](url)
        const regex = /!\[(.*?)\]\((.*?)\)/g;
        let match;
        const replacements: { original: string, newUrl: string }[] = [];
        const matches = [];

        // Collect all matches
        while ((match = regex.exec(markdown)) !== null) {
            matches.push({ full: match[0], alt: match[1], url: match[2] });
        }

        // Process sequentially (or concurrent with limit)
        for (const m of matches) {
            const { url: imageUrl } = m;
            if (!imageUrl || imageUrl.startsWith('http') === false) continue;

            // Try to resolve relative URLs if they leaked through
            let absoluteUrl = imageUrl;
            try {
                // If it's not absolute, new URL(url) throws.
                // We can use the current 'url' state as base.
                absoluteUrl = new URL(imageUrl, thisUrlIsAbsolute(imageUrl) ? undefined : url).href;
            } catch { }

            const needsProxy = isLikelyHotlinked(absoluteUrl) || !(await checkImageAccessible(absoluteUrl));
            if (needsProxy) {
                try {
                    const base64 = await fetchImageAsBase64(absoluteUrl);
                    const newUrl = await uploadImage(base64);
                    replacements.push({ original: imageUrl, newUrl }); // Replace original match string
                } catch (e) {
                    console.warn(`Failed to process image ${absoluteUrl}`, e);
                }
            }
        }

        let newMarkdown = markdown;
        for (const rep of replacements) {
            // Replace globally in case same image used twice
            newMarkdown = newMarkdown.split(rep.original).join(rep.newUrl);
        }
        return newMarkdown;
    };

    const thisUrlIsAbsolute = (u: string) => {
        try { new URL(u); return true; } catch { return false; }
    };

    const smartSplit = (text: string, limit: number = 3800): string[] => {
        if (!text) return [];
        if (text.length <= limit) return [text];

        const chunks = [];
        let currentIndex = 0;

        while (currentIndex < text.length) {
            let remaining = text.length - currentIndex;
            if (remaining <= limit) {
                chunks.push(text.substring(currentIndex));
                break;
            }

            // Search window: strictly limit length
            // We want to find the best break point *within* the limit
            const endBound = Math.min(currentIndex + limit, text.length);
            const windowText = text.substring(currentIndex, endBound);

            let splitOffset = -1;

            // Priority 1: Paragraph break (\n\n)
            // We look for the *last* occurrence to maximize chunk size
            let lastPara = windowText.lastIndexOf('\n\n');
            if (lastPara !== -1) {
                splitOffset = lastPara;
            }
            // Priority 2: Single Newline
            else {
                let lastLine = windowText.lastIndexOf('\n');
                if (lastLine !== -1) {
                    splitOffset = lastLine;
                }
                // Priority 3: Space (optional, maybe risky for CJK but acceptable)
                else {
                    let lastSpace = windowText.lastIndexOf(' ');
                    if (lastSpace !== -1) {
                        splitOffset = lastSpace;
                    }
                }
            }

            // Fallback: Force split at limit
            if (splitOffset === -1) {
                splitOffset = limit;
            }

            const splitIndex = currentIndex + splitOffset;

            // Push chunk
            chunks.push(text.substring(currentIndex, splitIndex));

            // Move index
            currentIndex = splitIndex;

            // Skip immediate leading whitespace/newlines for the next chunk to be clean
            while (currentIndex < text.length && (text[currentIndex] === '\n' || text[currentIndex] === ' ')) {
                currentIndex++;
            }
        }
        return chunks;
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

            if (mode === 'article') {
                setMessage('正在处理图片...');
                // 1. Process Images
                const finalContent = await processContentImages(content);

                const chunks = smartSplit(finalContent, 3800); // User requested ~4000 limit, using 3800 for safety
                const totalChunks = chunks.length;

                // 3. Create First Card
                let firstChunk = chunks[0];
                const footer = formatLogFooter(firstChunk);
                // First card gets source link + footer
                firstChunk = firstChunk + `\n\n> 来源: [${sourceTitle || title}](${url})` + footer;

                const res = await client.createCard({
                    title: title,
                    content: firstChunk,
                    space: selectedSpace || undefined
                });

                if (!res.success) throw new Error(res.message);

                // 4. Threading (Extensions)
                // 4. Threading (Append to same card)
                // Using createCard with SAME title triggers the "Append" behavior in Writeathon API.
                if (totalChunks > 1) {
                    for (let i = 1; i < totalChunks; i++) {
                        setMessage(`正在追加第 ${i + 1}/${totalChunks} 部分...`);
                        let chunkContent = chunks[i];
                        const chunkFooter = formatLogFooter(chunkContent);
                        chunkContent += chunkFooter;

                        // Use createCard with existing title to APPEND
                        const appendRes = await client.createCard({
                            title: title, // Must match original title exactly
                            content: chunkContent,
                            space: selectedSpace || undefined
                        });

                        if (!appendRes.success) {
                            throw new Error(`追加第 ${i + 1} 部分失败: ${appendRes.message}`);
                        }
                    }
                }

                // (Logic migrated to above block)
            } else if (mode === 'image') {
                // ... (existing image logic is fine, it uses the same uploadImage util) ...
                if (selectedImages.size === 0) throw new Error('请至少选择一张图片');

                let processedImagesMd = '';
                let successCount = 0;

                // Process selected images (upload if needed)
                for (const src of Array.from(selectedImages)) {
                    setMessage(`正在处理图片 ${successCount + 1}/${selectedImages.size}...`);
                    try {
                        let finalSrc = src;
                        const needsProxy = isLikelyHotlinked(src) || !(await checkImageAccessible(src));
                        if (needsProxy) {
                            try {
                                const base64 = await fetchImageAsBase64(src);
                                finalSrc = await uploadImage(base64);
                            } catch (e) {
                                console.warn('Image upload failed', e);
                            }
                        }
                        processedImagesMd += `![](${finalSrc})\n\n`;
                        successCount++;
                    } catch (e) {
                        console.error('Image loop error', e);
                    }
                }

                if (successCount === 0) throw new Error('没有图片能被保存');

                const res = await client.createCard({
                    title: `图片收藏: ${sourceTitle || title}`,
                    content: processedImagesMd + `> 来源: [${sourceTitle || title}](${url})`,
                    space: selectedSpace || undefined
                });
                if (!res.success) throw new Error(res.message);
            }

            setStatus('success');
            setMessage('');
            setTimeout(() => setStatus('idle'), 3000);

        } catch (err: any) {
            setStatus('error');
            setMessage(err.message || '保存失败');
        }
    };

    return (
        <div className="flex flex-col h-full bg-transparent relative">
            {/* Top Bar: Space & Mode */}
            <div className="px-4 py-3 flex items-center justify-between glass z-10">
                {/* Mode Switcher - Pill Style */}
                <div className="flex p-0.5 bg-gray-100/80 rounded-lg">
                    <button
                        onClick={() => setMode('article')}
                        className={`px-3 py-1.5 rounded-md text-[10px] font-bold transition-all flex items-center gap-1.5 ${mode === 'article'
                            ? 'bg-white text-teal-600 shadow-sm'
                            : 'text-gray-400 hover:text-gray-600'
                            }`}
                    >
                        <FileText className="h-3 w-3" />
                        全文剪藏
                    </button>
                    <button
                        onClick={() => setMode('image')}
                        className={`px-3 py-1.5 rounded-md text-[10px] font-bold transition-all flex items-center gap-1.5 ${mode === 'image'
                            ? 'bg-white text-teal-600 shadow-sm'
                            : 'text-gray-400 hover:text-gray-600'
                            }`}
                    >
                        <ImageIcon className="h-3 w-3" />
                        图片提取
                    </button>
                </div>

                {/* Right Side: Refresh & Space */}
                <div className="flex items-center gap-1">
                    {/* Refresh button is now inside the URL input for article mode */}
                    {/* <button
                        onClick={handleRefresh}
                        className="p-1.5 text-gray-400 hover:text-teal-600 hover:bg-teal-50 rounded-lg transition-colors"
                        title="刷新内容"
                    >
                        <RotateCw className={`h-3.5 w-3.5 ${status === 'loading' ? 'animate-spin' : ''}`} />
                    </button> */}

                    <div className="relative flex items-center">
                        <select
                            value={selectedSpace}
                            onChange={(e) => handleSpaceChange(e.target.value)}
                            className="appearance-none bg-teal-50/50 hover:bg-teal-100/50 border border-teal-100/50 rounded-xl px-3 py-1.5 text-[11px] font-bold text-teal-700 cursor-pointer transition-all pr-8 outline-none focus:ring-2 focus:ring-teal-500/10 focus:border-teal-300/50 max-w-[120px] truncate"
                        >
                            {spaces.map((space) => (
                                <option key={space._id || space.id} value={space._id || space.id}>
                                    {space.title}
                                </option>
                            ))}
                        </select>
                        <ChevronDown className="absolute right-2.5 h-3.5 w-3.5 text-teal-600 pointer-events-none" />
                    </div>
                </div>
            </div>

            {/* Main Content Area */}
            <div className="flex-1 overflow-y-auto">
                {mode === 'article' && (
                    <div className="p-5 space-y-4 max-w-2xl mx-auto">
                        <div className="relative space-y-2">
                            {/* Title Input */}
                            <input
                                type="text"
                                value={title}
                                onChange={(e) => setTitle(e.target.value)}
                                className="w-full text-base font-bold text-slate-800 bg-transparent border-none placeholder:text-slate-300 outline-none focus:ring-2 focus:ring-teal-500/10 focus:border-teal-500/20 rounded-lg px-2 py-1 -ml-2 transition-all"
                                placeholder="标题..."
                            />

                            {/* URL Input */}
                            <div className="flex items-center gap-2 bg-white/50 backdrop-blur-sm rounded-xl border border-white/60 px-3 py-1.5 shadow-sm transition-all focus-within:ring-2 focus-within:ring-teal-500/10 focus-within:border-teal-500/50">
                                <Globe className="h-3.5 w-3.5 text-slate-400 flex-shrink-0" />
                                <input
                                    type="text"
                                    value={url}
                                    onChange={(e) => setUrl(e.target.value)}
                                    className="flex-1 text-xs text-slate-500 bg-transparent border-none outline-none focus:ring-0 p-0 placeholder:text-slate-400"
                                    placeholder="https://..."
                                />
                                <button
                                    onClick={handleRefresh}
                                    title="刷新/解析链接内容"
                                    className="text-slate-400 hover:text-teal-600 transition-colors"
                                >
                                    <RotateCw className={`h-3.5 w-3.5 ${status === 'loading' ? 'animate-spin' : ''}`} />
                                </button>
                            </div>
                        </div>

                        <div className="relative group">
                            <textarea
                                value={content}
                                onChange={(e) => setContent(e.target.value)}
                                className="w-full h-[360px] text-sm leading-7 text-slate-600 bg-white/60 backdrop-blur-sm border border-white/60 rounded-xl p-4 focus:ring-1 focus:ring-teal-100 focus:border-teal-200 resize-none font-serif shadow-sm scrollbar-thin outline-none"
                                placeholder="内容将显示在这里..."
                            />
                            <div className="absolute bottom-4 right-4 flex items-center gap-3">
                                <span className="text-[10px] text-teal-600 bg-teal-50 px-2 py-1 rounded-full border border-teal-100 font-bold">
                                    预计 {estimatedCards} 张卡片
                                </span>
                                <span className="text-[10px] text-slate-400 bg-white/80 backdrop-blur px-2 py-1 rounded-full border border-white/60">
                                    {content.length} 字
                                </span>
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
                                <button onClick={scrapeImages} className="mt-2 text-xs text-teal-600 hover:underline">刷新重试</button>
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
            <div className="px-5 py-4 glass flex items-center justify-between z-20 border-t-0 bg-white/60 mt-auto">
                <div className="text-[10px] text-slate-400 font-medium">
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
