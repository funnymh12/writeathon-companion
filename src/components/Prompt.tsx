import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { WriteathonClient, Space, Card } from '../utils/api';
import { storage } from '../utils/storage';
import { formatLogFooter } from '../utils/textUtils';
import {
    Search, Plus, Check, Pin, PinOff, Clock, FolderOpen,
    Loader2, ChevronDown, X, Send, AlertCircle, Copy, RefreshCw
} from 'lucide-react';

interface PromptItem extends Card {
    isPinned?: boolean;
    tags?: string[];
    usedAt?: number;
}

// 独立的卡片组件 - 优雅的视觉风格
interface PromptCardProps {
    prompt: PromptItem;
    showTime?: boolean;
    isExpanded: boolean;
    isCopied: boolean;
    isPinned: boolean;
    onToggleExpand: (id: string) => void;
    onCopy: (prompt: PromptItem) => void;
    onTogglePin: (id: string) => void;
    onInsert: (prompt: PromptItem) => void;
    getPromptContent: (content: string) => string;
}

const PromptCard: React.FC<PromptCardProps> = ({
    prompt,
    showTime,
    isExpanded,
    isCopied,
    isPinned,
    onToggleExpand,
    onCopy,
    onTogglePin,
    onInsert,
    getPromptContent
}) => {
    const id = prompt._id || prompt.id || '';
    const content = getPromptContent(prompt.content || '');

    const formatTime = (timestamp: number) => {
        const diff = Date.now() - timestamp;
        if (diff < 60000) return '刚刚';
        if (diff < 3600000) return `${Math.floor(diff / 60000)}分钟前`;
        if (diff < 86400000) return `${Math.floor(diff / 3600000)}小时前`;
        return `${Math.floor(diff / 86400000)}天前`;
    };

    return (
        <div
            className={`group bg-white rounded-xl border transition-all duration-300 overflow-hidden ${isExpanded
                ? 'border-teal-400 shadow-md ring-1 ring-teal-100'
                : 'border-gray-100 hover:border-teal-200 hover:shadow-sm'
                }`}
        >
            <div className="p-3.5">
                <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0 cursor-pointer" onClick={() => onToggleExpand(id)}>
                        <h3 className="font-semibold text-gray-800 text-[13px] leading-tight truncate group-hover:text-teal-600 transition-colors">
                            {prompt.title}
                        </h3>

                        {/* 标签展示 */}
                        {prompt.tags && prompt.tags.length > 0 && (
                            <div className="flex flex-wrap gap-1 mt-1.5">
                                {prompt.tags.slice(0, 3).map((tag, i) => (
                                    <span key={i} className="text-[10px] text-teal-600 bg-teal-50 px-1.5 py-0.5 rounded-full font-medium">
                                        {tag}
                                    </span>
                                ))}
                            </div>
                        )}

                        {showTime && prompt.usedAt && (
                            <div className="flex items-center gap-1 mt-1.5 opacity-60">
                                <Clock className="h-2.5 w-2.5" />
                                <span className="text-[10px] text-gray-400">
                                    {formatTime(prompt.usedAt)}
                                </span>
                            </div>
                        )}
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                        <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); onTogglePin(id); }}
                            className={`p-1.5 rounded-lg transition-all ${isPinned
                                ? 'text-amber-500 bg-amber-50 shadow-inner'
                                : 'text-gray-300 hover:text-amber-500 hover:bg-amber-50'
                                }`}
                        >
                            {isPinned ? <Pin className="h-3.5 w-3.5 fill-current" /> : <PinOff className="h-3.5 w-3.5" />}
                        </button>

                        <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); onCopy(prompt); }}
                            className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-all shadow-sm active:scale-95 ${isCopied
                                ? 'bg-green-500 text-white'
                                : 'bg-gray-50 text-gray-600 hover:bg-teal-600 hover:text-white'
                                }`}
                        >
                            {isCopied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                            <span>{isCopied ? '已复制' : '复制'}</span>
                        </button>
                    </div>
                </div>

                {/* 展开的详情内容 */}
                <div className={`grid transition-all duration-300 ease-in-out ${isExpanded ? 'grid-rows-[1fr] opacity-100 mt-3 pt-3 border-t border-gray-50' : 'grid-rows-[0fr] opacity-0'}`}>
                    <div className="overflow-hidden">
                        <div className="bg-gray-50 rounded-lg p-3 relative group/content">
                            <p className="text-xs text-gray-600 whitespace-pre-wrap leading-relaxed max-h-40 overflow-y-auto scrollbar-thin">
                                {content}
                            </p>
                            <div className="mt-3">
                                <button
                                    type="button"
                                    onClick={(e) => { e.stopPropagation(); onInsert(prompt); }}
                                    className="w-full flex items-center justify-center gap-1.5 px-4 py-2 bg-teal-600 text-white text-xs font-bold rounded-lg hover:bg-teal-700 transition-all shadow-sm active:translate-y-0.5"
                                >
                                    <Send className="h-3.5 w-3.5" />
                                    插入到输入框
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

const Prompt: React.FC = () => {
    // 状态管理
    const [prompts, setPrompts] = useState<PromptItem[]>([]);
    const [filteredPrompts, setFilteredPrompts] = useState<PromptItem[]>([]);
    const [pinnedIds, setPinnedIds] = useState<string[]>([]);
    const [recentUsed, setRecentUsed] = useState<{ id: string; timestamp: number }[]>([]);
    const [searchQuery, setSearchQuery] = useState('');
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [refreshing, setRefreshing] = useState(false);

    // 空间配置
    const [spaces, setSpaces] = useState<Space[]>([]);
    const [promptSpaceId, setPromptSpaceId] = useState('');
    const [showSpaceSelector, setShowSpaceSelector] = useState(false);

    // 编辑器状态
    const [showEditor, setShowEditor] = useState(false);
    const [newTitle, setNewTitle] = useState('');
    const [newTags, setNewTags] = useState('');
    const [newContent, setNewContent] = useState('');
    const [saving, setSaving] = useState(false);

    const [expandedId, setExpandedId] = useState<string | null>(null);
    const [copiedId, setCopiedId] = useState<string | null>(null);

    // 初始化数据
    useEffect(() => {
        loadData();
    }, []);

    // 搜索过滤引擎
    useEffect(() => {
        if (!searchQuery.trim()) {
            setFilteredPrompts(prompts);
        } else {
            const query = searchQuery.toLowerCase();
            setFilteredPrompts(prompts.filter(p =>
                p.title.toLowerCase().includes(query) ||
                p.content?.toLowerCase().includes(query) ||
                p.tags?.some(t => t.toLowerCase().includes(query))
            ));
        }
    }, [searchQuery, prompts]);

    const loadData = async () => {
        setLoading(true);
        setError('');
        try {
            const data = await storage.get();
            setPinnedIds(data.pinnedPrompts || []);
            setRecentUsed(data.recentUsedPrompts || []);
            setPromptSpaceId(data.promptSpaceId || '');

            if (data.token && data.userId) {
                const client = new WriteathonClient(data.token, data.userId);
                const spacesRes = await client.getSpaces();
                if (spacesRes.success && spacesRes.data) {
                    setSpaces(spacesRes.data);
                }

                if (data.promptSpaceId) {
                    await loadPrompts(data.promptSpaceId);
                }
            }
        } catch (err: any) {
            setError(err.message || '初始化失败');
        } finally {
            setLoading(false);
        }
    };

    const loadPrompts = async (spaceId: string) => {
        setRefreshing(true);
        try {
            const data = await storage.get();
            if (!data.token || !data.userId) return;

            const client = new WriteathonClient(data.token, data.userId);
            const res = await client.getRecentCards(true, spaceId);

            if (res.success && res.data) {
                // 并发获取所有卡片的详情内容
                const cardsWithDetails = await Promise.all(
                    res.data.slice(0, 50).map(async (card) => {
                        const cardId = card._id || card.id || '';
                        if (card.content && card.content.trim()) return card;

                        try {
                            const detail = await client.getCardDetail(cardId);
                            return detail.success && detail.data
                                ? { ...card, content: detail.data.content }
                                : card;
                        } catch {
                            return card;
                        }
                    })
                );

                const processed = cardsWithDetails.map(card => ({
                    ...card,
                    tags: extractTags(card.content || ''),
                    isPinned: pinnedIds.includes(card._id || card.id || '')
                }));

                setPrompts(processed);
                setFilteredPrompts(processed);
            }
        } catch (err: any) {
            setError('同步云端数据失败');
        } finally {
            setRefreshing(false);
        }
    };

    const extractTags = (content: string): string[] => {
        const matches = content.match(/#[\u4e00-\u9fa5\w]+/g);
        return matches ? [...new Set(matches)] : [];
    };

    const getPromptContent = useCallback((content: string): string => {
        return content
            .replace(/^#+\s*.*$/m, '') // 移除标题
            .replace(/^#[\u4e00-\u9fa5\w\s]+$/gm, '') // 移除标签行
            .trim();
    }, []);

    const handleSelectSpace = async (spaceId: string) => {
        setPromptSpaceId(spaceId);
        setShowSpaceSelector(false);
        await storage.set({ promptSpaceId: spaceId });
        await loadPrompts(spaceId);
    };

    const recordUsage = useCallback(async (promptId: string) => {
        const newRecord = { id: promptId, timestamp: Date.now() };
        setRecentUsed(prev => {
            const updated = [newRecord, ...prev.filter(r => r.id !== promptId)].slice(0, 10);
            storage.set({ recentUsedPrompts: updated });
            return updated;
        });
    }, []);

    const handleCopy = useCallback(async (prompt: PromptItem) => {
        const content = getPromptContent(prompt.content || '');
        const promptId = prompt._id || prompt.id || '';

        try {
            if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
                await navigator.clipboard.writeText(content);
            } else {
                const textArea = document.createElement('textarea');
                textArea.value = content;
                textArea.style.cssText = 'position:fixed;left:-9999px;top:-9999px;opacity:0;';
                document.body.appendChild(textArea);
                textArea.focus();
                textArea.select();
                try {
                    document.execCommand('copy');
                } finally {
                    document.body.removeChild(textArea);
                }
            }

            setCopiedId(promptId);
            setTimeout(() => setCopiedId(null), 2000);
            await recordUsage(promptId);
        } catch (err) {
            setError('复制功能受限');
        }
    }, [getPromptContent, recordUsage]);

    const handleTogglePin = useCallback(async (promptId: string) => {
        setPinnedIds(prev => {
            const updated = prev.includes(promptId)
                ? prev.filter(id => id !== promptId)
                : [promptId, ...prev];
            storage.set({ pinnedPrompts: updated });
            return updated;
        });
    }, []);

    const handleToggleExpand = useCallback((id: string) => {
        setExpandedId(prev => prev === id ? null : id);
    }, []);

    const handleInsert = useCallback(async (prompt: PromptItem) => {
        const content = getPromptContent(prompt.content || '');
        try {
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            if (!tab?.id || tab.url?.startsWith('chrome://')) {
                await handleCopy(prompt);
                return;
            }

            const results = await chrome.scripting.executeScript({
                target: { tabId: tab.id },
                func: (text: string) => {
                    const selectors = [
                        'textarea[placeholder*="消息"]', 'textarea[placeholder*="输入"]',
                        'textarea[placeholder*="Message"]', 'textarea:not([readonly])',
                        '[contenteditable="true"]', '[role="textbox"]'
                    ];

                    for (const selector of selectors) {
                        const el = document.querySelector(selector) as HTMLElement;
                        if (el && el.getBoundingClientRect().width > 0) {
                            if ('value' in el) {
                                (el as any).value = text;
                                el.dispatchEvent(new Event('input', { bubbles: true }));
                            } else {
                                el.textContent = text;
                                el.dispatchEvent(new InputEvent('input', { bubbles: true, data: text }));
                            }
                            el.focus();
                            return true;
                        }
                    }
                    return false;
                },
                args: [content]
            });

            if (results && results[0]?.result) {
                setCopiedId(prompt._id || prompt.id || '');
                setTimeout(() => setCopiedId(null), 2000);
                await recordUsage(prompt._id || prompt.id || '');
            } else {
                await handleCopy(prompt);
            }
        } catch {
            await handleCopy(prompt);
        }
    }, [getPromptContent, handleCopy, recordUsage]);

    const handleSave = async () => {
        if (!newTitle.trim() || !newContent.trim()) {
            setError('请填写完整内容');
            return;
        }

        setSaving(true);
        setError('');

        try {
            const data = await storage.get();
            const client = new WriteathonClient(data.token!, data.userId!);

            let fullContent = newContent.trim();
            if (newTags.trim()) {
                const tags = newTags.split(/[\s,，]+/).filter(t => t).map(t => t.startsWith('#') ? t : `#${t}`);
                fullContent = tags.join(' ') + '\n\n' + fullContent;
            }

            // Append Log Footer
            fullContent += formatLogFooter(fullContent);

            const res = await client.createCard({
                title: newTitle.trim(),
                content: fullContent,
                space: promptSpaceId
            });

            if (res.success) {
                await loadPrompts(promptSpaceId);
                setShowEditor(false);
                setNewTitle('');
                setNewTags('');
                setNewContent('');
            } else {
                setError(res.message || '保存失败');
            }
        } catch (err: any) {
            setError('网络请求失败');
        } finally {
            setSaving(false);
        }
    };

    const pinnedPrompts = useMemo(() =>
        filteredPrompts.filter(p => pinnedIds.includes(p._id || p.id || '')),
        [filteredPrompts, pinnedIds]
    );

    const normalPrompts = useMemo(() =>
        filteredPrompts.filter(p => !pinnedIds.includes(p._id || p.id || '')),
        [filteredPrompts, pinnedIds]
    );

    const recentPrompts = useMemo(() =>
        recentUsed
            .slice(0, 5)
            .map(r => prompts.find(p => (p._id || p.id) === r.id))
            .filter(Boolean) as PromptItem[],
        [recentUsed, prompts]
    );

    if (!promptSpaceId && !loading) {
        return (
            <div className="flex flex-col h-full bg-white p-6 animate-in fade-in duration-500">
                <div className="flex-1 flex flex-col items-center justify-center text-center">
                    <div className="w-20 h-20 bg-teal-50 rounded-3xl rotate-12 flex items-center justify-center mb-6 shadow-sm">
                        <FolderOpen className="h-10 w-10 text-teal-500 -rotate-12" />
                    </div>
                    <h3 className="text-xl font-bold text-gray-800 mb-2">选择 Prompt 存储空间</h3>
                    <p className="text-sm text-gray-400 mb-8 max-w-[220px]">
                        为了保持写拉松的整洁，建议选择或创建一个专门存放 Prompt 的空间。
                    </p>

                    <div className="w-full space-y-3">
                        {spaces.map(space => (
                            <button
                                key={space._id || space.id}
                                type="button"
                                onClick={() => handleSelectSpace(space._id || space.id || '')}
                                className="w-full p-4 text-left rounded-xl border border-gray-100 bg-gray-50/50 hover:border-teal-400 hover:bg-teal-50 transition-all group"
                            >
                                <span className="font-semibold text-gray-700 group-hover:text-teal-700">{space.title}</span>
                            </button>
                        ))}
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="flex flex-col h-full bg-slate-50 relative overflow-hidden">
            {/* Header Area */}
            <div className="bg-white px-4 pt-4 pb-3 border-b border-gray-100 shadow-sm sticky top-0 z-30">
                <div className="flex items-center justify-between mb-4">
                    <button
                        type="button"
                        onClick={() => setShowSpaceSelector(!showSpaceSelector)}
                        className="group flex items-center gap-1.5 px-2 py-1 bg-gray-100 rounded-full hover:bg-teal-50 transition-colors"
                    >
                        <FolderOpen className="h-3.5 w-3.5 text-gray-400 group-hover:text-teal-500" />
                        <span className="text-[11px] font-bold text-gray-600 group-hover:text-teal-700 truncate max-w-[120px]">
                            {spaces.find(s => (s._id || s.id) === promptSpaceId)?.title || 'Prompt 空间'}
                        </span>
                        <ChevronDown className={`h-3 w-3 text-gray-400 group-hover:text-teal-500 transition-transform ${showSpaceSelector ? 'rotate-180' : ''}`} />
                    </button>

                    <button
                        type="button"
                        onClick={() => loadPrompts(promptSpaceId)}
                        disabled={refreshing}
                        className="p-1.5 text-gray-400 hover:text-teal-600 transition-colors bg-gray-50 rounded-lg"
                    >
                        <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin text-teal-500' : ''}`} />
                    </button>
                </div>

                {/* Search & New */}
                <div className="flex gap-2">
                    <div className="flex-1 relative group">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-300 group-focus-within:text-teal-500 transition-colors" />
                        <input
                            type="text"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            placeholder="寻找你的灵感..."
                            className="w-full h-10 pl-10 pr-4 rounded-xl border-transparent bg-gray-100 text-[13px] focus:bg-white focus:border-teal-500 focus:ring-4 focus:ring-teal-500/10 outline-none transition-all"
                        />
                    </div>
                    <button
                        type="button"
                        onClick={() => setShowEditor(true)}
                        className="h-10 px-4 bg-teal-600 text-white text-[13px] font-bold rounded-xl hover:bg-teal-700 transition-all shadow-md shadow-teal-700/10 active:scale-95 flex items-center gap-1.5 shrink-0"
                    >
                        <Plus className="h-4 w-4 stroke-[3px]" />
                        <span>新建</span>
                    </button>
                </div>
            </div>

            {/* List Area */}
            <div className="flex-1 overflow-y-auto p-4 space-y-6 scrollbar-thin">
                {loading ? (
                    <div className="flex flex-col items-center justify-center py-20 animate-pulse">
                        <Loader2 className="h-8 w-8 animate-spin text-teal-500 mb-4" />
                        <p className="text-xs text-gray-400 font-medium">同步云端记忆...</p>
                    </div>
                ) : (
                    <>
                        {/* Pinned Section */}
                        {pinnedPrompts.length > 0 && (
                            <section className="animate-in fade-in slide-in-from-top-4 duration-500">
                                <h4 className="flex items-center gap-2 text-[11px] font-black text-amber-600 uppercase tracking-widest mb-3 px-1">
                                    <Pin className="h-3 w-3 fill-current" />
                                    置顶收藏
                                </h4>
                                <div className="space-y-3">
                                    {pinnedPrompts.map(prompt => (
                                        <PromptCard
                                            key={prompt._id || prompt.id}
                                            prompt={prompt}
                                            isExpanded={expandedId === (prompt._id || prompt.id)}
                                            isCopied={copiedId === (prompt._id || prompt.id)}
                                            isPinned={true}
                                            onToggleExpand={handleToggleExpand}
                                            onCopy={handleCopy}
                                            onTogglePin={handleTogglePin}
                                            onInsert={handleInsert}
                                            getPromptContent={getPromptContent}
                                        />
                                    ))}
                                </div>
                            </section>
                        )}

                        {/* Normal List */}
                        {normalPrompts.length > 0 && (
                            <section className="animate-in fade-in slide-in-from-top-4 duration-700">
                                <h4 className="flex items-center gap-2 text-[11px] font-black text-gray-400 uppercase tracking-widest mb-3 px-1">
                                    <FolderOpen className="h-3 w-3" />
                                    所有库
                                </h4>
                                <div className="space-y-3">
                                    {normalPrompts.map(prompt => (
                                        <PromptCard
                                            key={prompt._id || prompt.id}
                                            prompt={prompt}
                                            isExpanded={expandedId === (prompt._id || prompt.id)}
                                            isCopied={copiedId === (prompt._id || prompt.id)}
                                            isPinned={false}
                                            onToggleExpand={handleToggleExpand}
                                            onCopy={handleCopy}
                                            onTogglePin={handleTogglePin}
                                            onInsert={handleInsert}
                                            getPromptContent={getPromptContent}
                                        />
                                    ))}
                                </div>
                            </section>
                        )}

                        {!loading && filteredPrompts.length === 0 && (
                            <div className="text-center py-20">
                                <div className="bg-gray-100 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
                                    <Search className="h-6 w-6 text-gray-300" />
                                </div>
                                <p className="text-sm text-gray-400">没有找到相关 Prompt</p>
                            </div>
                        )}

                        <div className="h-4" />
                    </>
                )}
            </div>

            {/* Space Dropdown */}
            {showSpaceSelector && (
                <div
                    className="fixed inset-0 bg-black/5 z-40"
                    onClick={() => setShowSpaceSelector(false)}
                />
            )}
            <div className={`absolute left-4 right-4 top-14 bg-white border border-gray-100 rounded-2xl shadow-xl z-50 transition-all duration-300 transform ${showSpaceSelector ? 'translate-y-0 opacity-100' : '-translate-y-4 opacity-0 pointer-events-none'}`}>
                <div className="p-2 max-h-60 overflow-y-auto scrollbar-thin">
                    <div className="px-3 py-2 text-[10px] font-bold text-gray-400 uppercase tracking-tight">切换空间</div>
                    {spaces.map(space => (
                        <button
                            key={space._id || space.id}
                            type="button"
                            onClick={() => handleSelectSpace(space._id || space.id || '')}
                            className={`w-full px-3 py-2.5 text-left text-sm rounded-xl transition-all flex items-center justify-between group ${(space._id || space.id) === promptSpaceId
                                ? 'text-teal-600 bg-teal-50/50'
                                : 'text-gray-700 hover:bg-gray-50'
                                }`}
                        >
                            <span className="font-semibold">{space.title}</span>
                            {(space._id || space.id) === promptSpaceId && <Check className="h-4 w-4" />}
                        </button>
                    ))}
                </div>
            </div>

            {/* Editor Overlay */}
            {showEditor && (
                <div className="absolute inset-0 bg-white z-[60] flex flex-col animate-in slide-in-from-bottom-full duration-300">
                    <div className="flex items-center justify-between px-6 py-5 border-b border-gray-50">
                        <h3 className="text-lg font-black text-gray-800">创作新 Prompt</h3>
                        <button
                            type="button"
                            onClick={() => setShowEditor(false)}
                            className="p-2 text-gray-400 hover:text-gray-800 bg-gray-100 rounded-full transition-all active:scale-90"
                        >
                            <X className="h-5 w-5" />
                        </button>
                    </div>

                    <div className="flex-1 overflow-y-auto p-6 space-y-6">
                        <div className="space-y-1.5">
                            <label className="text-[11px] font-black text-gray-400 uppercase tracking-wider ml-1">标题</label>
                            <input
                                type="text"
                                value={newTitle}
                                onChange={(e) => setNewTitle(e.target.value)}
                                placeholder="给你的 Prompt 起个名字"
                                className="w-full h-12 px-4 rounded-xl bg-gray-100 border-none text-[15px] font-bold text-gray-800 focus:bg-white focus:ring-4 focus:ring-teal-500/10 outline-none transition-all placeholder:text-gray-300"
                            />
                        </div>

                        <div className="space-y-1.5">
                            <label className="text-[11px] font-black text-gray-400 uppercase tracking-wider ml-1">标签</label>
                            <input
                                type="text"
                                value={newTags}
                                onChange={(e) => setNewTags(e.target.value)}
                                placeholder="#写作 #代码 #周报"
                                className="w-full h-12 px-4 rounded-xl bg-gray-100 border-none text-sm font-medium text-teal-600 focus:bg-white focus:ring-4 focus:ring-teal-500/10 outline-none transition-all placeholder:text-gray-300"
                            />
                        </div>

                        <div className="space-y-1.5">
                            <label className="text-[11px] font-black text-gray-400 uppercase tracking-wider ml-1">Prompt 内容</label>
                            <textarea
                                value={newContent}
                                onChange={(e) => setNewContent(e.target.value)}
                                placeholder="在这里详细描述你的指令..."
                                className="w-full h-60 px-4 py-3 rounded-xl bg-gray-100 border-none text-sm leading-relaxed text-gray-700 focus:bg-white focus:ring-4 focus:ring-teal-500/10 outline-none transition-all resize-none scrollbar-thin placeholder:text-gray-300"
                            />
                        </div>

                        {error && (
                            <div className="flex items-center gap-2 p-4 bg-red-50 text-red-600 text-[13px] font-semibold rounded-xl animate-bounce">
                                <AlertCircle className="h-4 w-4" />
                                {error}
                            </div>
                        )}
                    </div>

                    <div className="p-6 border-t border-gray-50 flex gap-3">
                        <button
                            type="button"
                            onClick={handleSave}
                            disabled={saving || !newTitle.trim() || !newContent.trim()}
                            className="flex-1 h-12 bg-teal-600 text-white font-black rounded-xl hover:bg-teal-700 transition-all shadow-lg shadow-teal-700/20 disabled:opacity-50 active:scale-[0.98] flex items-center justify-center gap-2"
                        >
                            {saving ? <Loader2 className="h-5 w-5 animate-spin" /> : <Plus className="h-5 w-5 stroke-[3px]" />}
                            保存到云端
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
};

export default Prompt;
