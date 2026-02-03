import React, { useState, useEffect } from 'react';
import { WriteathonClient, Space } from '../utils/api';
import { storage } from '../utils/storage';
import { Send, Loader2, Check, Quote, X, Clipboard, ChevronDown, Sparkles } from 'lucide-react';

const Memo: React.FC = () => {
    const [spaces, setSpaces] = useState<Space[]>([]);
    const [selectedSpace, setSelectedSpace] = useState('');
    const [title, setTitle] = useState('');
    const [content, setContent] = useState('');
    const [quote, setQuote] = useState(''); // 原文/引用
    const [loading, setLoading] = useState(false);
    const [sending, setSending] = useState(false);
    const [status, setStatus] = useState<'idle' | 'success' | 'error'>('idle');
    const [error, setError] = useState('');

    const [quickSendKey, setQuickSendKey] = useState('Ctrl+Enter');

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
    }, []);

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
            if (key === 'Enter') key = 'Enter';

            parts.push(key);
            return parts.join('+');
        };

        const pressed = getKeyString(e);
        if (pressed === quickSendKey) {
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
            // Clear current quote first
            setQuote('');

            // Try to read from clipboard
            if (navigator.clipboard && navigator.clipboard.readText) {
                const text = await navigator.clipboard.readText();
                if (text && text.trim()) {
                    setQuote(text.trim());
                    return;
                }
            }

            // Fallback: execute script in active tab to get clipboard
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            if (tab?.id && !tab.url?.startsWith('chrome://')) {
                const results = await chrome.scripting.executeScript({
                    target: { tabId: tab.id },
                    func: async () => {
                        try {
                            return await navigator.clipboard.readText();
                        } catch {
                            return '';
                        }
                    }
                });
                const clipText = results[0]?.result;
                if (clipText && clipText.trim()) {
                    setQuote(clipText.trim());
                }
            }
        } catch (err) {
            console.error('读取剪贴板失败', err);
            setError('读取剪贴板失败，请手动粘贴');
            setTimeout(() => setError(''), 3000);
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
                <div className="space-y-6 min-h-full flex flex-col">

                    {/* 1. Quote Block (Conditional) */}
                    {quote && (
                        <div className="relative group animate-in slide-in-from-top-2 fade-in duration-300">
                            <div className="p-5 bg-gradient-to-br from-indigo-50/50 to-purple-50/30 rounded-2xl border border-indigo-100/50 text-sm text-gray-600 leading-relaxed font-serif shadow-sm">
                                <Quote className="h-4 w-4 text-indigo-200 absolute top-4 left-4" />
                                <div className="pl-6 relative z-10 whitespace-pre-wrap">
                                    {quote}
                                </div>
                            </div>
                            <button
                                onClick={clearQuote}
                                className="absolute -top-2 -right-2 p-1.5 bg-white border border-gray-100 rounded-full shadow-sm text-gray-400 hover:text-red-500 hover:border-red-100 transition-all opacity-0 group-hover:opacity-100 scale-90 hover:scale-100"
                                title="移除引用"
                            >
                                <X className="h-3 w-3" />
                            </button>
                        </div>
                    )}

                    {/* 2. Writing Area */}
                    <div className="flex-1 flex flex-col space-y-4">
                        <input
                            type="text"
                            placeholder="无标题"
                            value={title}
                            onChange={(e) => setTitle(e.target.value)}
                            onKeyDown={handleKeyDown}
                            className="w-full text-xl font-bold text-gray-900 placeholder:text-gray-300 border-none focus:ring-0 px-0 bg-transparent tracking-tight"
                        />
                        <textarea
                            placeholder={quote ? "写下你的想法..." : "捕捉当下的灵感..."}
                            value={content}
                            onChange={(e) => setContent(e.target.value)}
                            onKeyDown={handleKeyDown}
                            className="w-full flex-1 resize-none text-base leading-7 text-gray-700 placeholder:text-gray-300/70 border-none focus:ring-0 px-0 py-0 bg-transparent min-h-[200px]"
                        />
                    </div>
                </div>
            </div>

            {/* Bottom Toolbar */}
            <div className="px-5 py-4 border-t border-gray-50 flex items-center justify-between bg-white z-20">
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
                    {/* Potentially other tools here like AI helper */}
                    <button
                        onClick={() => { /* AI Expand? Future feature */ }}
                        className="p-2 text-gray-400 hover:text-purple-500 hover:bg-purple-50 rounded-full transition-colors hidden sm:block"
                        title="AI 润色 (Coming Soon)"
                    >
                        <Sparkles className="h-4 w-4" />
                    </button>

                    <button
                        onClick={handleSend}
                        disabled={sending || (!content.trim() && !quote.trim())}
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
