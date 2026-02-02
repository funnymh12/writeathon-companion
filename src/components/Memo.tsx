import React, { useState, useEffect } from 'react';
import { WriteathonClient, Space } from '../utils/api';
import { storage } from '../utils/storage';
import { Send, Loader2, Check, Quote, X, Clipboard } from 'lucide-react';

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

    useEffect(() => {
        fetchSpaces();
        // Try to get selected text from the page
        getSelectedText();
    }, []);

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
                    if (data.selectedSpaceId && response.data.find(s => s.id === data.selectedSpaceId)) {
                        setSelectedSpace(data.selectedSpaceId);
                    } else if (response.data.length > 0) {
                        setSelectedSpace(response.data[0].id);
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
        const spaceName = spaces.find(s => s.id === spaceId)?.title || '默认空间';
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
                func: () => window.getSelection()?.toString() || ''
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
        <div className="flex flex-col gap-4 p-4">
            <div className="space-y-4">
                {/* Space Selector */}
                <div className="space-y-2">
                    <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                        空间
                    </label>
                    <select
                        value={selectedSpace}
                        onChange={(e) => handleSpaceChange(e.target.value)}
                        disabled={loading}
                        className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                        <option value="">默认空间</option>
                        {spaces.map((space) => (
                            <option key={space.id} value={space.id}>
                                {space.title}
                            </option>
                        ))}
                    </select>
                </div>

                {/* Title */}
                <div className="space-y-2">
                    <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                        标题（可选）
                    </label>
                    <input
                        type="text"
                        placeholder="给卡片起个标题..."
                        value={title}
                        onChange={(e) => setTitle(e.target.value)}
                        className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    />
                </div>

                {/* Quote Section */}
                <div className="space-y-2">
                    <div className="flex items-center justify-between">
                        <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1">
                            <Quote className="h-3 w-3" />
                            原文引用（可选）
                        </label>
                        <button
                            onClick={pasteFromClipboard}
                            className="text-xs text-teal-500 hover:text-teal-600 flex items-center gap-1"
                            title="从剪贴板粘贴"
                        >
                            <Clipboard className="h-3 w-3" />
                            粘贴
                        </button>
                    </div>

                    {quote ? (
                        <div className="relative">
                            <div className="p-3 bg-gray-50 border-l-4 border-gray-300 rounded-r-md text-sm text-gray-700 whitespace-pre-wrap max-h-32 overflow-y-auto">
                                {quote}
                            </div>
                            <button
                                onClick={clearQuote}
                                className="absolute top-2 right-2 p-1 bg-white rounded-full shadow-sm hover:bg-gray-100 transition-colors"
                                title="清除引用"
                            >
                                <X className="h-3 w-3 text-gray-500" />
                            </button>
                        </div>
                    ) : (
                        <textarea
                            placeholder="粘贴或输入要引用的原文..."
                            value={quote}
                            onChange={(e) => setQuote(e.target.value)}
                            rows={2}
                            className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring resize-none text-gray-600"
                        />
                    )}

                    <p className="text-[10px] text-gray-400">
                        💡 选中网页文字后打开侧边栏，将自动获取选中内容
                    </p>
                </div>

                {/* Annotation/Content */}
                <div className="space-y-2">
                    <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                        {quote ? '批注' : '内容'}
                    </label>
                    <textarea
                        placeholder={quote ? "写下你的批注、想法..." : "写点什么..."}
                        value={content}
                        onChange={(e) => setContent(e.target.value)}
                        rows={quote ? 4 : 8}
                        className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring resize-none min-h-[100px]"
                    />
                </div>

                {/* Preview */}
                {(quote || content) && (
                    <div className="space-y-2">
                        <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                            预览
                        </label>
                        <div className="p-3 bg-gray-50 rounded-md border border-gray-100 text-xs space-y-2 max-h-40 overflow-y-auto">
                            {quote && (
                                <div className="text-gray-600 border-l-2 border-gray-300 pl-2">
                                    {quote.split('\n').map((line, i) => (
                                        <div key={i}>&gt; {line}</div>
                                    ))}
                                </div>
                            )}
                            {quote && content && <div className="h-2"></div>}
                            {content && (
                                <div className="text-gray-800 whitespace-pre-wrap">{content}</div>
                            )}
                        </div>
                    </div>
                )}

                {/* Error Message */}
                {error && (
                    <div className={`p-3 rounded-lg text-xs ${error.startsWith('✅')
                        ? 'bg-green-50 border border-green-200 text-green-700'
                        : 'bg-red-50 border border-red-200 text-red-700'}`}>
                        {error}
                    </div>
                )}

                {/* Send Button */}
                <button
                    onClick={handleSend}
                    disabled={sending || (!content.trim() && !quote.trim())}
                    className={`w-full flex items-center justify-center gap-2 px-4 py-2 rounded-md font-medium text-sm transition-colors ${status === 'success'
                        ? 'bg-green-600 hover:bg-green-700 text-white'
                        : 'bg-teal-500 hover:bg-teal-600 text-white'
                        } disabled:opacity-50 disabled:cursor-not-allowed`}
                >
                    {sending ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                    ) : status === 'success' ? (
                        <>
                            <Check className="h-4 w-4" />
                            发送成功
                        </>
                    ) : (
                        <>
                            <Send className="h-4 w-4" />
                            {quote ? '发送批注卡片' : '发送到写拉松'}
                        </>
                    )}
                </button>

                {status === 'error' && !error && (
                    <p className="text-xs text-red-600 text-center">
                        发送失败，请重试
                    </p>
                )}
            </div>
        </div>
    );
};

export default Memo;
