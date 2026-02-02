import React, { useState, useEffect, useCallback } from 'react';
import { WriteathonClient, Space, Card } from '../utils/api';
import { storage } from '../utils/storage';
import {
    Search, Plus, Copy, Check, Pin, PinOff, Clock, FolderOpen,
    Loader2, ChevronDown, ChevronUp, X, Send, AlertCircle
} from 'lucide-react';

interface PromptItem extends Card {
    isPinned?: boolean;
    tags?: string[];
}

const Prompt: React.FC = () => {
    // 状态
    const [prompts, setPrompts] = useState<PromptItem[]>([]);
    const [filteredPrompts, setFilteredPrompts] = useState<PromptItem[]>([]);
    const [pinnedIds, setPinnedIds] = useState<string[]>([]);
    const [recentUsed, setRecentUsed] = useState<{ id: string; timestamp: number }[]>([]);
    const [searchQuery, setSearchQuery] = useState('');
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    // 空间相关
    const [spaces, setSpaces] = useState<Space[]>([]);
    const [promptSpaceId, setPromptSpaceId] = useState('');
    const [showSpaceSelector, setShowSpaceSelector] = useState(false);

    // 新建/编辑
    const [showEditor, setShowEditor] = useState(false);
    const [editingPrompt, setEditingPrompt] = useState<PromptItem | null>(null);
    const [newTitle, setNewTitle] = useState('');
    const [newTags, setNewTags] = useState('');
    const [newContent, setNewContent] = useState('');
    const [saving, setSaving] = useState(false);

    // 展开的卡片
    const [expandedId, setExpandedId] = useState<string | null>(null);

    // 复制成功状态
    const [copiedId, setCopiedId] = useState<string | null>(null);

    // 初始化
    useEffect(() => {
        loadData();
    }, []);

    // 搜索过滤
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

            // 加载本地存储的数据
            setPinnedIds(data.pinnedPrompts || []);
            setRecentUsed(data.recentUsedPrompts || []);
            setPromptSpaceId(data.promptSpaceId || '');

            // 获取空间列表
            if (data.token && data.userId) {
                const client = new WriteathonClient(data.token, data.userId);
                const spacesRes = await client.getSpaces();
                if (spacesRes.success && spacesRes.data) {
                    setSpaces(spacesRes.data);
                }

                // 如果有设定 Prompt 空间，加载 Prompts
                if (data.promptSpaceId) {
                    await loadPrompts(data.promptSpaceId);
                }
            }
        } catch (err: any) {
            setError(err.message || '加载失败');
        } finally {
            setLoading(false);
        }
    };

    const loadPrompts = async (spaceId: string) => {
        try {
            const data = await storage.get();
            if (!data.token || !data.userId) return;

            const client = new WriteathonClient(data.token, data.userId);
            const res = await client.getRecentCards(true, spaceId);

            if (res.success && res.data) {
                // 解析标签和处理数据
                const processed = res.data.map(card => {
                    const tags = extractTags(card.content || '');
                    return {
                        ...card,
                        tags,
                        isPinned: pinnedIds.includes(card._id || card.id || '')
                    };
                });
                setPrompts(processed);
                setFilteredPrompts(processed);
            }
        } catch (err: any) {
            setError('加载 Prompt 失败');
        }
    };

    // 从内容中提取 #标签
    const extractTags = (content: string): string[] => {
        const matches = content.match(/#[\u4e00-\u9fa5\w]+/g);
        return matches ? [...new Set(matches)] : [];
    };

    // 获取 Prompt 的纯内容（去掉标签行）
    const getPromptContent = (content: string): string => {
        // 移除开头的标签行
        return content
            .replace(/^#+\s*.*$/m, '') // 移除标题行
            .replace(/^#[\u4e00-\u9fa5\w\s]+$/gm, '') // 移除纯标签行
            .trim();
    };

    // 选择 Prompt 空间
    const handleSelectSpace = async (spaceId: string) => {
        setPromptSpaceId(spaceId);
        setShowSpaceSelector(false);
        await storage.set({ promptSpaceId: spaceId });
        await loadPrompts(spaceId);
    };

    // 复制 Prompt
    const handleCopy = async (prompt: PromptItem) => {
        const content = getPromptContent(prompt.content || '');
        await navigator.clipboard.writeText(content);
        setCopiedId(prompt._id || prompt.id || '');
        setTimeout(() => setCopiedId(null), 2000);

        // 记录使用
        await recordUsage(prompt._id || prompt.id || '');
    };

    // 记录使用历史
    const recordUsage = async (promptId: string) => {
        const newRecord = { id: promptId, timestamp: Date.now() };
        const updated = [newRecord, ...recentUsed.filter(r => r.id !== promptId)].slice(0, 10);
        setRecentUsed(updated);
        await storage.set({ recentUsedPrompts: updated });
    };

    // 置顶/取消置顶
    const handleTogglePin = async (promptId: string) => {
        let updated: string[];
        if (pinnedIds.includes(promptId)) {
            updated = pinnedIds.filter(id => id !== promptId);
        } else {
            updated = [promptId, ...pinnedIds];
        }
        setPinnedIds(updated);
        await storage.set({ pinnedPrompts: updated });

        // 更新列表中的状态
        setPrompts(prev => prev.map(p => ({
            ...p,
            isPinned: updated.includes(p._id || p.id || '')
        })));
    };

    // 快速插入到页面输入框
    const handleInsert = async (prompt: PromptItem) => {
        const content = getPromptContent(prompt.content || '');

        try {
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            if (!tab?.id) return;

            await chrome.scripting.executeScript({
                target: { tabId: tab.id },
                func: (text: string) => {
                    // 查找可能的输入框
                    const selectors = [
                        'textarea',
                        '[contenteditable="true"]',
                        'input[type="text"]',
                        '[role="textbox"]'
                    ];

                    for (const selector of selectors) {
                        const el = document.querySelector(selector) as HTMLElement;
                        if (el) {
                            if (el.tagName === 'TEXTAREA' || el.tagName === 'INPUT') {
                                (el as HTMLInputElement).value = text;
                                el.dispatchEvent(new Event('input', { bubbles: true }));
                            } else {
                                el.textContent = text;
                                el.dispatchEvent(new Event('input', { bubbles: true }));
                            }
                            el.focus();
                            return true;
                        }
                    }
                    return false;
                },
                args: [content]
            });

            await recordUsage(prompt._id || prompt.id || '');
        } catch (err) {
            console.error('插入失败:', err);
            // 回退到复制
            await handleCopy(prompt);
        }
    };

    // 保存新 Prompt
    const handleSave = async () => {
        if (!newTitle.trim() || !newContent.trim()) {
            setError('标题和内容不能为空');
            return;
        }

        if (!promptSpaceId) {
            setError('请先选择 Prompt 存储空间');
            return;
        }

        setSaving(true);
        setError('');

        try {
            const data = await storage.get();
            if (!data.token || !data.userId) {
                setError('请先登录');
                return;
            }

            const client = new WriteathonClient(data.token, data.userId);

            // 构建内容：标签 + 内容
            let fullContent = newContent.trim();
            if (newTags.trim()) {
                const tags = newTags.split(/[\s,，]+/).filter(t => t).map(t => t.startsWith('#') ? t : `#${t}`);
                fullContent = tags.join(' ') + '\n\n' + fullContent;
            }

            const res = await client.createCard({
                title: newTitle.trim(),
                content: fullContent,
                space: promptSpaceId
            });

            if (res.success) {
                // 重新加载列表
                await loadPrompts(promptSpaceId);
                // 关闭编辑器
                setShowEditor(false);
                setNewTitle('');
                setNewTags('');
                setNewContent('');
            } else {
                setError(res.message || '保存失败');
            }
        } catch (err: any) {
            setError(err.message || '保存失败');
        } finally {
            setSaving(false);
        }
    };

    // 获取置顶的 Prompts
    const pinnedPrompts = filteredPrompts.filter(p => pinnedIds.includes(p._id || p.id || ''));

    // 获取非置顶的 Prompts
    const normalPrompts = filteredPrompts.filter(p => !pinnedIds.includes(p._id || p.id || ''));

    // 获取最近使用（只显示前5个）
    const recentPrompts = recentUsed
        .slice(0, 5)
        .map(r => {
            const prompt = prompts.find(p => (p._id || p.id) === r.id);
            return prompt ? { ...prompt, usedAt: r.timestamp } : null;
        })
        .filter(Boolean) as (PromptItem & { usedAt: number })[];

    // 格式化时间
    const formatTime = (timestamp: number) => {
        const diff = Date.now() - timestamp;
        if (diff < 60000) return '刚刚';
        if (diff < 3600000) return `${Math.floor(diff / 60000)}分钟前`;
        if (diff < 86400000) return `${Math.floor(diff / 3600000)}小时前`;
        return `${Math.floor(diff / 86400000)}天前`;
    };

    // Prompt 卡片组件
    const PromptCard = ({ prompt, showTime }: { prompt: PromptItem & { usedAt?: number }; showTime?: boolean }) => {
        const id = prompt._id || prompt.id || '';
        const isExpanded = expandedId === id;
        const isCopied = copiedId === id;
        const isPinned = pinnedIds.includes(id);

        return (
            <div className="bg-white rounded-lg border border-gray-100 hover:border-teal-200 transition-all overflow-hidden">
                <div className="p-3">
                    <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                            <h3
                                className="font-medium text-gray-800 text-sm truncate cursor-pointer hover:text-teal-600"
                                onClick={() => setExpandedId(isExpanded ? null : id)}
                            >
                                {prompt.title}
                            </h3>
                            {prompt.tags && prompt.tags.length > 0 && (
                                <div className="flex flex-wrap gap-1 mt-1">
                                    {prompt.tags.slice(0, 3).map((tag, i) => (
                                        <span key={i} className="text-[10px] text-gray-400 bg-gray-50 px-1.5 py-0.5 rounded">
                                            {tag}
                                        </span>
                                    ))}
                                </div>
                            )}
                            {showTime && prompt.usedAt && (
                                <span className="text-[10px] text-gray-300 mt-1 block">
                                    {formatTime(prompt.usedAt)}
                                </span>
                            )}
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                            <button
                                onClick={() => handleTogglePin(id)}
                                className={`p-1.5 rounded-md transition-colors ${isPinned ? 'text-amber-500 bg-amber-50' : 'text-gray-300 hover:text-amber-500 hover:bg-amber-50'}`}
                                title={isPinned ? '取消置顶' : '置顶'}
                            >
                                {isPinned ? <Pin className="h-3.5 w-3.5" /> : <PinOff className="h-3.5 w-3.5" />}
                            </button>
                            <button
                                onClick={() => handleCopy(prompt)}
                                className={`px-2.5 py-1 rounded-md text-xs font-medium transition-all ${isCopied
                                    ? 'bg-green-500 text-white'
                                    : 'bg-teal-50 text-teal-600 hover:bg-teal-100'
                                    }`}
                            >
                                {isCopied ? <Check className="h-3.5 w-3.5" /> : '复制'}
                            </button>
                        </div>
                    </div>

                    {/* 展开内容 */}
                    {isExpanded && (
                        <div className="mt-3 pt-3 border-t border-gray-50">
                            <p className="text-xs text-gray-600 whitespace-pre-wrap leading-relaxed max-h-48 overflow-y-auto">
                                {getPromptContent(prompt.content || '')}
                            </p>
                            <div className="flex gap-2 mt-3">
                                <button
                                    onClick={() => handleInsert(prompt)}
                                    className="flex-1 flex items-center justify-center gap-1 px-3 py-1.5 bg-teal-600 text-white text-xs rounded-md hover:bg-teal-700 transition-colors"
                                >
                                    <Send className="h-3 w-3" />
                                    插入到输入框
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        );
    };

    // 如果没有选择 Prompt 空间
    if (!promptSpaceId && !loading) {
        return (
            <div className="flex flex-col h-full bg-white p-4">
                <div className="flex-1 flex flex-col items-center justify-center text-center">
                    <div className="w-16 h-16 bg-teal-50 rounded-full flex items-center justify-center mb-4">
                        <FolderOpen className="h-8 w-8 text-teal-500" />
                    </div>
                    <h3 className="text-lg font-medium text-gray-800 mb-2">选择 Prompt 存储空间</h3>
                    <p className="text-sm text-gray-500 mb-6 max-w-[250px]">
                        请选择一个写拉松空间来存储你的 Prompt，建议创建专门的空间
                    </p>

                    <div className="w-full space-y-2">
                        {spaces.map(space => (
                            <button
                                key={space._id || space.id}
                                onClick={() => handleSelectSpace(space._id || space.id || '')}
                                className="w-full p-3 text-left rounded-lg border border-gray-200 hover:border-teal-400 hover:bg-teal-50 transition-all"
                            >
                                <span className="font-medium text-gray-700">{space.title}</span>
                            </button>
                        ))}
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="flex flex-col h-full bg-white relative">
            {/* Header */}
            <div className="px-4 py-3 border-b border-gray-50 bg-white sticky top-0 z-10">
                {/* 空间选择器 */}
                <div className="flex items-center justify-between mb-3">
                    <button
                        onClick={() => setShowSpaceSelector(!showSpaceSelector)}
                        className="flex items-center gap-1 text-xs text-gray-500 hover:text-teal-600"
                    >
                        <FolderOpen className="h-3.5 w-3.5" />
                        <span>{spaces.find(s => (s._id || s.id) === promptSpaceId)?.title || 'Prompt 空间'}</span>
                        <ChevronDown className="h-3 w-3" />
                    </button>
                    <button
                        onClick={() => loadPrompts(promptSpaceId)}
                        className="text-xs text-gray-400 hover:text-teal-600"
                    >
                        刷新
                    </button>
                </div>

                {/* 空间下拉列表 */}
                {showSpaceSelector && (
                    <div className="absolute left-4 right-4 top-12 bg-white border border-gray-200 rounded-lg shadow-lg z-20 max-h-48 overflow-y-auto">
                        {spaces.map(space => (
                            <button
                                key={space._id || space.id}
                                onClick={() => handleSelectSpace(space._id || space.id || '')}
                                className={`w-full px-3 py-2 text-left text-sm hover:bg-teal-50 ${(space._id || space.id) === promptSpaceId ? 'text-teal-600 bg-teal-50' : 'text-gray-700'
                                    }`}
                            >
                                {space.title}
                            </button>
                        ))}
                    </div>
                )}

                {/* 搜索和新建 */}
                <div className="flex gap-2">
                    <div className="flex-1 relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-300" />
                        <input
                            type="text"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            placeholder="搜索 Prompt..."
                            className="w-full h-9 pl-9 pr-3 rounded-lg border border-gray-200 bg-gray-50 text-sm focus:border-teal-500 focus:ring-1 focus:ring-teal-500 outline-none"
                        />
                    </div>
                    <button
                        onClick={() => setShowEditor(true)}
                        className="h-9 px-3 bg-teal-600 text-white text-sm font-medium rounded-lg hover:bg-teal-700 transition-colors flex items-center gap-1"
                    >
                        <Plus className="h-4 w-4" />
                        新建
                    </button>
                </div>
            </div>

            {/* 内容区域 */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
                {loading ? (
                    <div className="flex items-center justify-center py-12">
                        <Loader2 className="h-6 w-6 animate-spin text-teal-500" />
                    </div>
                ) : error ? (
                    <div className="flex items-center gap-2 p-3 bg-red-50 text-red-600 text-sm rounded-lg">
                        <AlertCircle className="h-4 w-4" />
                        {error}
                    </div>
                ) : prompts.length === 0 ? (
                    <div className="text-center py-12 text-gray-400">
                        <p className="text-sm">暂无 Prompt</p>
                        <p className="text-xs mt-1">点击"新建"添加你的第一个 Prompt</p>
                    </div>
                ) : (
                    <>
                        {/* 置顶区域 */}
                        {pinnedPrompts.length > 0 && (
                            <div>
                                <h4 className="flex items-center gap-1.5 text-xs font-medium text-amber-600 mb-2">
                                    <Pin className="h-3.5 w-3.5" />
                                    置顶
                                </h4>
                                <div className="space-y-2">
                                    {pinnedPrompts.map(prompt => (
                                        <PromptCard key={prompt._id || prompt.id} prompt={prompt} />
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* 全部 Prompt */}
                        {normalPrompts.length > 0 && (
                            <div>
                                <h4 className="flex items-center gap-1.5 text-xs font-medium text-gray-500 mb-2">
                                    <FolderOpen className="h-3.5 w-3.5" />
                                    全部 Prompt
                                </h4>
                                <div className="space-y-2">
                                    {normalPrompts.map(prompt => (
                                        <PromptCard key={prompt._id || prompt.id} prompt={prompt} />
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* 最近使用 */}
                        {recentPrompts.length > 0 && (
                            <div>
                                <h4 className="flex items-center gap-1.5 text-xs font-medium text-gray-400 mb-2">
                                    <Clock className="h-3.5 w-3.5" />
                                    最近使用
                                </h4>
                                <div className="space-y-1">
                                    {recentPrompts.map(prompt => (
                                        <div
                                            key={prompt._id || prompt.id}
                                            className="flex items-center justify-between px-2 py-1.5 rounded hover:bg-gray-50 cursor-pointer"
                                            onClick={() => handleCopy(prompt)}
                                        >
                                            <span className="text-xs text-gray-600 truncate">{prompt.title}</span>
                                            <span className="text-[10px] text-gray-300 shrink-0 ml-2">
                                                {formatTime(prompt.usedAt)}
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </>
                )}
            </div>

            {/* 新建/编辑弹窗 */}
            {showEditor && (
                <div className="absolute inset-0 bg-white z-30 flex flex-col">
                    <div className="flex items-center justify-between px-4 py-3 border-b">
                        <h3 className="font-medium text-gray-800">新建 Prompt</h3>
                        <button onClick={() => setShowEditor(false)} className="p-1 text-gray-400 hover:text-gray-600">
                            <X className="h-5 w-5" />
                        </button>
                    </div>

                    <div className="flex-1 overflow-y-auto p-4 space-y-4">
                        <div>
                            <label className="block text-xs font-medium text-gray-500 mb-1">标题</label>
                            <input
                                type="text"
                                value={newTitle}
                                onChange={(e) => setNewTitle(e.target.value)}
                                placeholder="Prompt 名称"
                                className="w-full h-10 px-3 rounded-lg border border-gray-200 text-sm focus:border-teal-500 focus:ring-1 focus:ring-teal-500 outline-none"
                            />
                        </div>

                        <div>
                            <label className="block text-xs font-medium text-gray-500 mb-1">标签（可选，空格分隔）</label>
                            <input
                                type="text"
                                value={newTags}
                                onChange={(e) => setNewTags(e.target.value)}
                                placeholder="#代码 #翻译"
                                className="w-full h-10 px-3 rounded-lg border border-gray-200 text-sm focus:border-teal-500 focus:ring-1 focus:ring-teal-500 outline-none"
                            />
                        </div>

                        <div>
                            <label className="block text-xs font-medium text-gray-500 mb-1">Prompt 内容</label>
                            <textarea
                                value={newContent}
                                onChange={(e) => setNewContent(e.target.value)}
                                placeholder="在这里输入或粘贴你的 Prompt..."
                                className="w-full h-48 px-3 py-2 rounded-lg border border-gray-200 text-sm focus:border-teal-500 focus:ring-1 focus:ring-teal-500 outline-none resize-none"
                            />
                        </div>

                        {error && (
                            <div className="flex items-center gap-2 p-3 bg-red-50 text-red-600 text-sm rounded-lg">
                                <AlertCircle className="h-4 w-4" />
                                {error}
                            </div>
                        )}
                    </div>

                    <div className="p-4 border-t">
                        <button
                            onClick={handleSave}
                            disabled={saving || !newTitle.trim() || !newContent.trim()}
                            className="w-full h-10 bg-teal-600 text-white font-medium rounded-lg hover:bg-teal-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                        >
                            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                            保存到写拉松
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
};

export default Prompt;
