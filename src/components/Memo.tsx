import React, { useState, useEffect, useRef } from 'react';
import { WriteathonClient, Space } from '../utils/api';
import { storage } from '../utils/storage';
import { handlePasteImage } from '../utils/imageUtils';
import { formatLogFooter } from '../utils/textUtils';
import { Send, Loader2, Check, Quote, X, Clipboard, ChevronDown, Sparkles, Image as ImageIcon } from 'lucide-react';

const Memo: React.FC = () => {
    const [spaces, setSpaces] = useState<Space[]>([]);
    const [selectedSpace, setSelectedSpace] = useState('');
    const [title, setTitle] = useState('');
    const [content, setContent] = useState('');
    const [quote, setQuote] = useState(''); // 原文/引用
    const [loading, setLoading] = useState(false);
    const [sending, setSending] = useState(false);
    const [uploadingImage, setUploadingImage] = useState(false);
    const [status, setStatus] = useState<'idle' | 'success' | 'error'>('idle');
    const [error, setError] = useState('');

    const [quickSendKey, setQuickSendKey] = useState('Ctrl+Enter');

    // Refs for auto-resizing
    const contentRef = useRef<HTMLTextAreaElement>(null);
    const quoteRef = useRef<HTMLTextAreaElement>(null);

    useEffect(() => {
        fetchSpaces();
        // Try to get selected text from the page
        getSelectedText();
        // Load shortcut
        storage.get().then(data => {
            if (data.shortcuts && data.shortcuts.quickSend) {
                setQuickSendKey(data.shortcuts.quickSend);
            }
        });

        // Listen for storage changes
        const listener = (changes: any) => {
            if (changes.shortcuts && changes.shortcuts.newValue?.quickSend) {
                setQuickSendKey(changes.shortcuts.newValue.quickSend);
            }
        };
        chrome.storage.onChanged.addListener(listener);
        return () => chrome.storage.onChanged.removeListener(listener);
    }, []);

    // Auto-resize Quote
    useEffect(() => {
        if (quoteRef.current) {
            quoteRef.current.style.height = 'auto'; // Reset
            quoteRef.current.style.height = `${quoteRef.current.scrollHeight}px`;
        }
    }, [quote]);

    // Auto-resize Content
    useEffect(() => {
        if (contentRef.current) {
            contentRef.current.style.height = 'auto'; // Reset
            // Min height of ~200px
            const scrollHeight = Math.max(contentRef.current.scrollHeight, 200);
            contentRef.current.style.height = `${scrollHeight}px`;
        }
    }, [content]);

    const handleKeyDown = (e: React.KeyboardEvent) => {
        const getKeyString = (ev: React.KeyboardEvent) => {
            const parts = [];
            if (ev.ctrlKey) parts.push('Ctrl');
            if (ev.altKey) parts.push('Alt');
            if (ev.shiftKey) parts.push('Shift');
            if (ev.metaKey) parts.push('Meta');

            let key = ev.key;
            if (key === ' ') key = 'Space';
            if (key.toLowerCase() === 'enter') key = 'Enter';
            if (key.length === 1) key = key.toUpperCase();

            parts.push(key);
            return parts.join('+');
        };

        const pressed = getKeyString(e);
        if (pressed && quickSendKey && pressed.toLowerCase() === quickSendKey.toLowerCase()) {
            e.preventDefault();
            handleSend();
        }
    };

    const fetchSpaces = async () => {
        setLoading(true);
        try {
            const data = await storage.get();
            if (data.token && data.userId) {
                const client = new WriteathonClient(data.token, data.userId);
                const response = await client.getSpaces();
                if (response.success && response.data) {
                    setSpaces(response.data);
                    // 如果有保存的空间选择，使用它
                    const savedSpaceId = data.selectedSpaceId;
                    if (savedSpaceId && response.data.find(s => (s._id || s.id) === savedSpaceId)) {
                        setSelectedSpace(savedSpaceId);
                    } else if (response.data.length > 0) {
                        const first = response.data[0];
                        setSelectedSpace(first._id || first.id);
                    }
                }
            }
        } catch (err) {
            console.error('获取空间列表失败', err);
        } finally {
            setLoading(false);
        }
    };

    const handleSpaceChange = async (spaceId: string) => {
        setSelectedSpace(spaceId);
        const spaceName = spaces.find(s => (s._id || s.id) === spaceId)?.title || '默认空间';
        await storage.set({ selectedSpaceId: spaceId, selectedSpaceName: spaceName });
    };

    const getSelectedText = async () => {
        try {
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            if (!tab || !tab.id) return;

            // Skip internal pages
            if (tab.url?.startsWith('chrome://') || tab.url?.startsWith('edge://')) return;

            const results = await chrome.scripting.executeScript({
                target: { tabId: tab.id },
                func: () => {
                    const selection = window.getSelection();
                    if (!selection || selection.rangeCount === 0) return '';
                    if (selection.isCollapsed) return '';

                    const container = document.createElement('div');
                    container.appendChild(selection.getRangeAt(0).cloneContents());

                    // Replace images with Markdown
                    container.querySelectorAll('img').forEach(img => {
                        const alt = img.alt || '图片';
                        // Use absolute URL
                        const src = img.src;
                        if (src) {
                            const textNode = document.createTextNode(`![${alt}](${src})`);
                            img.parentNode?.replaceChild(textNode, img);
                        }
                    });

                    // Basic cleanup to preserve some spacing
                    return container.innerText || selection.toString();
                }
            });

            const selectedText = results[0]?.result;
            if (selectedText && selectedText.trim()) {
                setQuote(selectedText.trim());
            }
        } catch (err) {
            console.warn('获取选中文本失败', err);
        }
    };

    const pasteFromClipboard = async () => {
        try {
            // Check permissions first? Usually handled by manifest
            setQuote(''); // Clear current quote

            // Try to read from clipboard API
            if (navigator.clipboard && navigator.clipboard.readText) {
                const text = await navigator.clipboard.readText();
                if (text && text.trim()) {
                    setQuote(text.trim());
                    return;
                }
            }

            // Fallback
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            if (tab?.id && !tab.url?.startsWith('chrome://')) {
                const results = await chrome.scripting.executeScript({
                    target: { tabId: tab.id },
                    func: async () => {
                        try { return await navigator.clipboard.readText(); } catch { return ''; }
                    }
                });
                const clipText = results[0]?.result;
                if (clipText && clipText.trim()) setQuote(clipText.trim());
            }
        } catch (err) {
            console.error('读取剪贴板失败', err);
            setError('读取剪贴板失败，请手动粘贴');
            setTimeout(() => setError(''), 3000);
        }
    };

    const handlePaste = async (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
        // Handle image paste logic
        const handled = await handlePasteImage(
            e as any, // Cast to match generic clipboard event
            () => {
                setUploadingImage(true);
                // Insert placeholder
                const textarea = e.currentTarget;
                const start = textarea.selectionStart;
                const end = textarea.selectionEnd;
                const placeholder = '![Uploading image...]()';
                const newContent = content.substring(0, start) + placeholder + content.substring(end);
                setContent(newContent);
                // Move cursor after placeholder (simplified, might need better logic)
            },
            (url) => {
                setUploadingImage(false);
                // Replace placeholder with actual URL
                setContent((prev) => prev.replace('![Uploading image...]()', `![](${url})`));
            },
            (errMsg) => {
                setUploadingImage(false);
                setError(`图片上传失败: ${errMsg}`);
                // Remove placeholder
                setContent((prev) => prev.replace('![Uploading image...]()', ''));
                setTimeout(() => setError(''), 3000);
            }
        );

        if (!handled) {
            // Normal paste behavior continues automatically
        }
    };

    const handleSend = async () => {
        if (!content.trim() && !quote.trim()) {
            setError('请输入内容');
            return;
        }

        setSending(true);
        setStatus('idle');
        setError('');

        try {
            const data = await storage.get();
            if (data.token && data.userId) {
                const client = new WriteathonClient(data.token, data.userId);

                // Build final content with quote format
                let finalContent = '';

                if (quote.trim()) {
                    // Format quote as blockquote
                    const quotedLines = quote.trim().split('\n').map(line => `> ${line}`).join('\n');
                    finalContent = quotedLines;

                    // Try to append source URL
                    try {
                        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
                        if (tab && tab.url && tab.title && !tab.url.startsWith('chrome://')) {
                            finalContent += `\n\n> 来源: [${tab.title}](${tab.url})`;
                        }
                    } catch (e) {
                        console.warn('Failed to get tab info for source link', e);
                    }

                    if (content.trim()) {
                        finalContent += '\n\n' + content.trim();
                    }
                } else {
                    finalContent = content.trim();
                }

                // Append Footer
                finalContent += formatLogFooter(finalContent);

                const response = await client.createCard({
                    content: finalContent,
                    title: title.trim() || undefined,
                    space: selectedSpace || undefined,
                });

                if (response.success) {
                    setContent('');
                    setQuote('');
                    setTitle('');
                    setStatus('success');
                    setTimeout(() => setStatus('idle'), 3000);
                } else {
                    setStatus('error');
                    setError(response.message || '发送失败');
                }
            }
        } catch (err: any) {
            setStatus('error');
            setError(err.message || '发送失败');
        } finally {
            setSending(false);
        }
    };

    const clearQuote = () => {
        setQuote('');
    };

    return (
        <div className="flex flex-col h-full bg-white relative">
            {/* Top Bar: Space Selector */}
            <div className="px-5 py-3 border-b border-gray-50 flex items-center justify-between bg-white/80 backdrop-blur-sm z-10 sticky top-0">
                <div className="flex items-center gap-2 group relative">
                    <span className="text-[10px] uppercase font-bold text-gray-400 tracking-wider">Storage</span>
                    <div className="relative">
                        <select
                            value={selectedSpace}
                            onChange={(e) => handleSpaceChange(e.target.value)}
                            disabled={loading}
                            className="bg-transparent font-medium text-xs text-gray-700 focus:outline-none cursor-pointer hover:text-teal-600 transition-colors py-1 pr-4 appearance-none"
                        >
                            <option value="">默认空间</option>
                            {spaces.filter(s => s.title !== '默认空间').map((space) => {
                                const id = space._id || space.id;
                                const title = space.title.length > 10 ? space.title.substring(0, 10) + '...' : space.title;
                                return (
                                    <option key={id} value={id}>
                                        {title}
                                    </option>
                                );
                            })}
                        </select>
                        <ChevronDown className="absolute right-0 top-1/2 -translate-y-1/2 h-3 w-3 text-gray-300 pointer-events-none group-hover:text-teal-500 transition-colors" />
                    </div>
                </div>

                {/* Quick Actions (Paste) */}
                {!quote && (
                    <button
                        onClick={pasteFromClipboard}
                        className="p-1.5 text-gray-400 hover:text-teal-600 hover:bg-teal-50 rounded-lg transition-all flex items-center gap-1.5 text-[10px] font-medium"
                        title="从剪贴板粘贴引用"
                    >
                        <Clipboard className="h-3.5 w-3.5" />
                        <span className="hidden sm:inline">引用剪贴板</span>
                    </button>
                )}
            </div>

            {/* Main Scrollable Area */}
            <div className="flex-1 overflow-y-auto px-6 py-6 scrollbar-thin scrollbar-thumb-gray-100">
                <div className="space-y-6 min-h-full flex flex-col pb-20"> {/* pb-20 for safe scroll */}

                    {/* 1. Quote Block (Editable) */}
                    {quote && (
                        <div className="relative group animate-in slide-in-from-top-2 fade-in duration-300">
                            <div className="p-1 bg-gradient-to-br from-indigo-50/50 to-purple-50/30 rounded-2xl border border-indigo-100/50 shadow-sm relative">
                                <Quote className="h-4 w-4 text-indigo-300 absolute top-4 left-4 z-0 pointer-events-none" />
                                <textarea
                                    ref={quoteRef}
                                    value={quote}
                                    onChange={(e) => setQuote(e.target.value)}
                                    className="w-full bg-transparent border-none text-sm text-gray-600 leading-relaxed font-serif pl-10 pr-8 py-3 resize-none focus:ring-0 focus:outline-none placeholder-gray-400/50 min-h-[60px]"
                                    placeholder="引用内容..."
                                />
                            </div>
                            <button
                                onClick={clearQuote}
                                className="absolute -top-2 -right-2 p-1.5 bg-white border border-gray-100 rounded-full shadow-sm text-gray-400 hover:text-red-500 hover:border-red-100 transition-all opacity-0 group-hover:opacity-100 scale-90 hover:scale-100 z-10"
                                title="移除引用"
                            >
                                <X className="h-3 w-3" />
                            </button>
                        </div>
                    )}

                    {/* 2. Writing Area */}
                    <div className="flex-1 flex flex-col space-y-2">
                        <input
                            type="text"
                            placeholder="无标题"
                            value={title}
                            onChange={(e) => setTitle(e.target.value)}
                            onKeyDown={handleKeyDown}
                            className="w-full text-xl font-bold text-gray-900 placeholder:text-gray-300 border-none focus:ring-0 focus:outline-none focus:border-none px-0 bg-transparent tracking-tight outline-none"
                        />
                        <div className="relative">
                            <textarea
                                ref={contentRef}
                                placeholder={quote ? "写下你的想法..." : "捕捉当下的灵感... (支持粘贴图片)"}
                                value={content}
                                onChange={(e) => setContent(e.target.value)}
                                onPaste={handlePaste}
                                onKeyDown={handleKeyDown}
                                className="w-full resize-none text-base leading-7 text-gray-700 placeholder:text-gray-300/70 border-none focus:ring-0 focus:outline-none px-0 py-0 bg-transparent outline-none overflow-hidden"
                                style={{ minHeight: '200px' }}
                            />
                            {uploadingImage && (
                                <div className="absolute top-2 right-2 bg-black/60 backdrop-blur rounded-lg px-2 py-1 flex items-center gap-1.5 text-white text-[10px] animate-pulse">
                                    <ImageIcon className="h-3 w-3" />
                                    <span>上传图片中...</span>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>

            {/* Bottom Toolbar */}
            <div className="px-5 py-4 border-t border-gray-50 flex items-center justify-between bg-white z-20 sticky bottom-0">
                <div className="text-[10px] text-gray-400 flex items-center gap-2">
                    {/* Status / Hints */}
                    {status === 'error' ? (
                        <span className="text-red-500 font-medium bg-red-50 px-2 py-0.5 rounded-md flex items-center gap-1">
                            <X className="h-3 w-3" /> {error || '发送失败'}
                        </span>
                    ) : status === 'success' ? (
                        <span className="text-green-600 font-medium bg-green-50 px-2 py-0.5 rounded-md flex items-center gap-1">
                            <Check className="h-3 w-3" /> 已保存
                        </span>
                    ) : (
                        <div className="flex items-center gap-1 opacity-70">
                            <span className="font-mono bg-gray-100 px-1 py-0.5 rounded text-[9px]">{quickSendKey}</span>
                            <span>发送</span>
                        </div>
                    )}
                </div>

                <div className="flex gap-3">
                    <button
                        onClick={handleSend}
                        disabled={sending || uploadingImage || (!content.trim() && !quote.trim())}
                        className={`flex items-center gap-2 px-6 py-2.5 rounded-full font-bold text-sm transition-all shadow-md hover:shadow-lg disabled:shadow-none disabled:cursor-not-allowed ${status === 'success'
                            ? 'bg-green-500 text-white'
                            : 'bg-teal-500 hover:bg-teal-600 text-white shadow-teal-500/30'
                            }`}
                    >
                        {sending ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                        ) : status === 'success' ? (
                            <Check className="h-5 w-5" />
                        ) : (
                            <>
                                <Send className="h-4 w-4" />
                                <span>发送</span>
                            </>
                        )}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default Memo;
