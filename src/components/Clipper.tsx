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
    const [saveUrl, setSaveUrl] = useState(true);
    const [includeImages, setIncludeImages] = useState(true);
    const [useAttachments, setUseAttachments] = useState(true);
    const [stats, setStats] = useState({ words: 0, images: 0, links: 0 });
    const [error, setError] = useState('');

    // 空间相关
    const [spaces, setSpaces] = useState<Space[]>([]);
    const [selectedSpace, setSelectedSpace] = useState('');
    const [loadingSpaces, setLoadingSpaces] = useState(false);

    // 提取的图片列表
    const [extractedImages, setExtractedImages] = useState<{ alt: string; url: string }[]>([]);

    useEffect(() => {
        fetchSpaces();
        loadSavedSpace();
    }, []);

    const loadSavedSpace = async () => {
        const data = await storage.get();
        if (data.selectedSpaceId) {
            setSelectedSpace(data.selectedSpaceId);
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
                func: (opts: { includeImages: boolean }) => {
                    if ((window as any).writeathonClipper) {
                        return (window as any).writeathonClipper.getArticle(opts);
                    }
                    return {
                        title: document.title,
                        content: document.body.innerText.substring(0, 5000),
                        url: window.location.href,
                        stats: { words: document.body.innerText.length, images: 0, links: 0 }
                    };
                },
                args: [{ includeImages }]
            });
            return results[0]?.result;
        } catch (e) {
            console.error('Clipper execution failed:', e);
            return null;
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

        // 添加来源链接
        if (sourceUrl) {
            attachments.push({
                type: 'link',
                title: title || '来源页面',
                url: sourceUrl,
                excerpt: excerpt || '',
                from: 'default',
                content: excerpt || ''
            });
        }

        // 添加图片（最多5张）
        const maxImages = 5;
        extractedImages.slice(0, maxImages).forEach((img, index) => {
            attachments.push({
                type: 'image',
                title: img.alt || `图片 ${index + 1}`,
                url: img.url,
                content: `来自: ${title || '网页剪藏'}`
            });
        });

        return attachments;
    };

    const handleSave = async () => {
        if (!content.trim()) return;

        setSending(true);
        setStatus('idle');
        setError('');

        try {
            const data = await storage.get();
            if (data.token && data.userId) {
                const client = new WriteathonClient(data.token, data.userId);

                const MAX_CHUNK_SIZE = 4500;
                const chunks = splitContent(content, MAX_CHUNK_SIZE);
                const totalChunks = chunks.length;

                // Generate a unique title for multi-part articles
                const cardTitle = title.trim() || `剪藏 ${new Date().toLocaleString('zh-CN')}`;

                for (let i = 0; i < chunks.length; i++) {
                    let chunkContent = chunks[i];

                    // Add part indicator for multi-part articles
                    if (totalChunks > 1) {
                        chunkContent = `**[${i + 1}/${totalChunks}]**\n\n${chunkContent}`;
                    }

                    // Add source URL to first chunk only
                    if (i === 0 && saveUrl && sourceUrl) {
                        chunkContent += `\n\n> Source: [${sourceUrl}](${sourceUrl})`;
                    }

                    // 构建请求参数
                    const params: any = {
                        content: chunkContent,
                        title: cardTitle,
                    };

                    // 添加空间参数
                    if (selectedSpace) {
                        params.space = selectedSpace;
                    }

                    // 只在第一个chunk添加attachments
                    if (i === 0 && useAttachments) {
                        const attachments = buildAttachments();
                        if (attachments.length > 0) {
                            params.attachments = JSON.stringify(attachments);
                        }
                    }

                    const response = await client.createCard(params);

                    if (!response.success) {
                        const error: any = new Error(response.message || `保存第 ${i + 1} 部分失败`);
                        error.errorCode = response.errorCode;
                        throw error;
                    }
                }

                const spaceName = spaces.find(s => (s.id || s._id) === selectedSpace)?.title || '默认空间';
                setStatus('success');
                if (totalChunks > 1) {
                    setError(`✅ 已保存 ${totalChunks} 部分到「${cardTitle}」(${spaceName})`);
                } else {
                    setError(`✅ 已保存到 ${spaceName}`);
                }
                setTimeout(() => {
                    setStatus('idle');
                    setError('');
                }, 4000);
            }
        } catch (err: any) {
            setStatus('error');
            const code = err.errorCode ? `[${err.errorCode}] ` : '';
            const spaceInfo = selectedSpace ? ` (SpaceID: ${selectedSpace})` : '';
            setError(`${code}${err.message || '保存失败'}${spaceInfo}`);
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

        // 更新提取的图片
        setExtractedImages(extractImages(value));
    };

    return (
        <div className="flex flex-col gap-4 p-4 h-full bg-[#fafafa]">
            <div className="bg-white p-4 rounded-xl border border-gray-100 shadow-sm space-y-4">
                {/* Space Selector */}
                <div className="space-y-2">
                    <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest flex items-center gap-1">
                        <FolderOpen className="h-3 w-3" />
                        保存到空间
                    </label>
                    <select
                        value={selectedSpace}
                        onChange={(e) => handleSpaceChange(e.target.value)}
                        disabled={loadingSpaces}
                        className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                        <option value="">默认空间</option>
                        {spaces.filter(s => s.title !== '默认空间').map((space) => {
                            const id = space._id || space.id;
                            return (
                                <option key={id} value={id}>
                                    {space.title}
                                </option>
                            );
                        })}
                    </select>
                </div>

                {/* Clip Button */}
                <div className="flex gap-2">
                    <button
                        onClick={handleClip}
                        disabled={loading}
                        className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-teal-50 text-teal-600 rounded-lg font-bold text-sm hover:bg-teal-100 transition-colors border border-teal-100"
                    >
                        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                        提取页面内容
                    </button>
                    {content && (
                        <button
                            onClick={handleClip}
                            disabled={loading}
                            className="p-3 bg-gray-50 text-gray-600 rounded-lg hover:bg-gray-100 transition-colors border border-gray-100"
                            title="重新提取"
                        >
                            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                        </button>
                    )}
                </div>

                {/* Options Row */}
                <div className="flex items-center gap-4 flex-wrap">
                    <div className="flex items-center gap-2">
                        <input
                            type="checkbox"
                            id="includeImages"
                            checked={includeImages}
                            onChange={(e) => setIncludeImages(e.target.checked)}
                            className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
                        />
                        <label htmlFor="includeImages" className="text-xs font-medium text-gray-700 flex items-center gap-1">
                            <Image className="h-3 w-3" />
                            包含图片
                        </label>
                    </div>
                    <div className="flex items-center gap-2">
                        <input
                            type="checkbox"
                            id="useAttachments"
                            checked={useAttachments}
                            onChange={(e) => setUseAttachments(e.target.checked)}
                            className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
                        />
                        <label htmlFor="useAttachments" className="text-xs font-medium text-gray-700 flex items-center gap-1">
                            <Paperclip className="h-3 w-3" />
                            使用附件
                            <span className="text-[10px] px-1 py-0.5 bg-green-100 text-green-700 rounded">NEW</span>
                        </label>
                    </div>
                </div>

                {/* Message */}
                {error && (
                    <div className={`p-3 rounded-lg text-xs ${error.startsWith('✅')
                        ? 'bg-green-50 border border-green-200 text-green-700'
                        : 'bg-red-50 border border-red-200 text-red-700'}`}>
                        {error}
                    </div>
                )}

                {content && (
                    <div className="space-y-4 animate-in fade-in slide-in-from-top-2">
                        {/* Stats */}
                        <div className="flex gap-4 text-xs text-muted-foreground">
                            <span className={stats.words > 4500 ? 'text-teal-500 font-bold' : ''}>{stats.words} 字</span>
                            <span>{stats.images} 图</span>
                            <span>{stats.links} 链</span>
                            {useAttachments && extractedImages.length > 0 && (
                                <span className="text-green-600">📎 {Math.min(extractedImages.length, 5)} 附件</span>
                            )}
                        </div>

                        {/* Content Length Info */}
                        {stats.words > 4500 && (
                            <div className="p-2 bg-teal-50 border border-teal-200 rounded-lg text-teal-700 text-xs">
                                📝 内容较长（{stats.words} 字），将自动分成 {Math.ceil(stats.words / 4500)} 部分追加保存
                            </div>
                        )}

                        {/* Title */}
                        <div className="space-y-2">
                            <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">
                                标题
                            </label>
                            <input
                                type="text"
                                value={title}
                                onChange={(e) => setTitle(e.target.value)}
                                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                            />
                        </div>

                        {/* Content */}
                        <div className="space-y-2">
                            <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">
                                内容
                            </label>
                            <textarea
                                value={content}
                                onChange={(e) => handleContentChange(e.target.value)}
                                rows={12}
                                className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring resize-none font-mono text-xs leading-relaxed"
                            />
                        </div>

                        {/* Save Source URL */}
                        <div className="flex items-center gap-2">
                            <input
                                type="checkbox"
                                id="saveUrl"
                                checked={saveUrl}
                                onChange={(e) => setSaveUrl(e.target.checked)}
                                className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
                            />
                            <label htmlFor="saveUrl" className="text-xs font-medium text-gray-700 flex items-center gap-1">
                                <LinkIcon className="h-3 w-3" />
                                保存来源链接
                            </label>
                        </div>

                        {/* Save Button */}
                        <button
                            onClick={handleSave}
                            disabled={sending}
                            className={`w-full flex items-center justify-center gap-2 px-4 py-2 rounded-md font-medium text-sm transition-colors ${status === 'success'
                                ? 'bg-green-600 hover:bg-green-700 text-white'
                                : 'bg-teal-500 hover:bg-teal-600 text-white'
                                } disabled:opacity-50`}
                        >
                            {sending ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                            ) : status === 'success' ? (
                                <>
                                    <Check className="h-4 w-4" />
                                    已保存到写拉松
                                </>
                            ) : (
                                <>
                                    <Send className="h-4 w-4" />
                                    保存剪藏
                                </>
                            )}
                        </button>
                    </div>
                )}
            </div>

            {!content && !loading && (
                <div className="flex-1 flex flex-col items-center justify-center text-center p-8 space-y-4">
                    <div className="bg-gray-100 p-4 rounded-full">
                        <Download className="h-8 w-8 text-gray-400" />
                    </div>
                    <div>
                        <h3 className="text-sm font-bold text-gray-900">暂无内容</h3>
                        <p className="text-xs text-gray-500 mt-1 max-w-[200px]">
                            点击上方按钮提取当前网页内容，转换为 Markdown 格式保存
                        </p>
                    </div>
                </div>
            )}
        </div>
    );
};

export default Clipper;
