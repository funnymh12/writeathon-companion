import React, { useState, useEffect } from 'react';
import { WriteathonClient, Card, Space } from '../utils/api';
import { storage } from '../utils/storage';
import { Loader2, ArrowLeft, Send, Check, ChevronRight, Search, Edit3, Plus, Save, X, Sparkles, RefreshCw, Copy, FilePlus, CornerDownLeft } from 'lucide-react';

type View = 'list' | 'detail' | 'pick';
type Tab = 'recent' | 'pick';

const Recent: React.FC = () => {
    const [view, setView] = useState<View>('list');
    const [activeTab, setActiveTab] = useState<Tab>('recent');
    const [cards, setCards] = useState<Card[]>([]);
    const [filteredCards, setFilteredCards] = useState<Card[]>([]);
    const [pickedCards, setPickedCards] = useState<Card[]>([]);
    const [spaces, setSpaces] = useState<Space[]>([]);
    const [selectedSpace, setSelectedSpace] = useState('');
    const [loading, setLoading] = useState(false);
    const [selectedCard, setSelectedCard] = useState<Card | null>(null);
    const [searchQuery, setSearchQuery] = useState('');

    // Extend mode
    const [isExtending, setIsExtending] = useState(false);
    const [extensionContent, setExtensionContent] = useState('');
    const [extensionTitle, setExtensionTitle] = useState('');

    const [saving, setSaving] = useState(false);
    const [status, setStatus] = useState<'idle' | 'success' | 'error'>('idle');
    const [error, setError] = useState('');
    const [copied, setCopied] = useState(false);

    useEffect(() => {
        fetchSpaces();
    }, []);

    useEffect(() => {
        if (selectedSpace || spaces.length === 0) {
            fetchRecentCards();
        }
    }, [selectedSpace]); // Re-fetch when space changes

    useEffect(() => {
        // Filter cards based on search query
        if (searchQuery.trim()) {
            const query = searchQuery.toLowerCase();
            const filtered = cards.filter(card =>
                card.title?.toLowerCase().includes(query) ||
                card.content?.toLowerCase().includes(query)
            );
            setFilteredCards(filtered);
        } else {
            setFilteredCards(cards);
        }
    }, [searchQuery, cards]);

    const fetchRecentCards = async () => {
        setLoading(true);
        try {
            const data = await storage.get();
            if (data.token && data.userId) {
                const client = new WriteathonClient(data.token, data.userId);


                // Always fetch recent cards. If selectedSpace is provided, it filters by space.
                // Otherwise it returns the global recent list (usually 50 items).
                const response = await client.getRecentCards(false, selectedSpace || undefined);

                if (response.success && response.data) {
                    setCards(response.data);
                    setFilteredCards(response.data);
                } else {
                    // Handle case where data might be null or empty
                    setCards([]);
                    setFilteredCards([]);
                }
            }
        } catch (err) {
            console.error('获取最近卡片失败', err);
        } finally {
            setLoading(false);
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
                    // Load saved space preference
                    if (data.selectedSpaceId) {
                        const saved = response.data.find(s => (s._id || s.id) === data.selectedSpaceId);
                        if (saved) {
                            setSelectedSpace(data.selectedSpaceId);
                        }
                    }
                }
            }
        } catch (err) {
            console.error('获取空间列表失败', err);
        }
    };

    const fetchPickedCards = async () => {
        setLoading(true);
        setError('');
        try {
            const data = await storage.get();
            if (data.token && data.userId) {
                const client = new WriteathonClient(data.token, data.userId);
                const response = await client.writingPick('card', 5);
                if (response.success && response.data) {
                    setPickedCards(response.data);
                } else {
                    setError(response.message || '获取拾贝失败');
                }
            }
        } catch (err: any) {
            console.error('获取拾贝失败', err);
            setError(err.message || '获取拾贝失败');
        } finally {
            setLoading(false);
        }
    };

    const handleCardClick = async (card: Card) => {
        setLoading(true);
        setError('');
        try {
            const data = await storage.get();
            if (data.token && data.userId) {
                const client = new WriteathonClient(data.token, data.userId);
                // Check if card already has content (from pick API) or fetches it
                if (card.content) {
                    setSelectedCard(card);
                    setView('detail');
                } else {
                    const response = await client.getCardDetail(card._id || card.id || '');
                    if (response.success && response.data) {
                        setSelectedCard(response.data);
                        setView('detail');
                    }
                }
                setIsExtending(false);
            }
        } catch (err: any) {
            console.error('获取卡片详情失败', err);
            setError(err.message || '获取卡片详情失败');
        } finally {
            setLoading(false);
        }
    };



    const handleExtend = async () => {
        if (!extensionContent.trim() || !selectedCard) return;

        setSaving(true);
        setStatus('idle');
        setError('');

        try {
            const data = await storage.get();
            if (data.token && data.userId) {
                const client = new WriteathonClient(data.token, data.userId);
                const response = await client.extendCard(
                    selectedCard._id || selectedCard.id || '',
                    extensionContent,
                    extensionTitle.trim() || undefined
                );

                if (response.success) {
                    setExtensionContent('');
                    setExtensionTitle('');
                    setStatus('success');
                    setIsExtending(false);
                    setTimeout(() => setStatus('idle'), 2000);
                } else {
                    setStatus('error');
                    setError(response.message || '扩展失败');
                }
            }
        } catch (err: any) {
            setStatus('error');
            setError(err.message || '扩展失败');
        } finally {
            setSaving(false);
        }
    };

    const handleAppend = async () => {
        if (!extensionContent.trim() || !selectedCard) return;

        setSaving(true);
        setStatus('idle');
        setError('');

        try {
            const data = await storage.get();
            if (data.token && data.userId) {
                const client = new WriteathonClient(data.token, data.userId);
                // "Create" with existing title appends to the card
                const response = await client.createCard({
                    title: selectedCard.title,
                    content: extensionContent,
                    space: selectedSpace || undefined
                });

                if (response.success) {
                    setExtensionContent('');
                    setExtensionTitle('');
                    setStatus('success');
                    setIsExtending(false);
                    // Update local card content immediately for better UX
                    setSelectedCard({
                        ...selectedCard,
                        content: (selectedCard.content || '') + '\n\n' + extensionContent
                    });
                    setTimeout(() => setStatus('idle'), 2000);
                } else {
                    setStatus('error');
                    setError(response.message || '追加失败');
                }
            }
        } catch (err: any) {
            setStatus('error');
            setError(err.message || '追加失败');
        } finally {
            setSaving(false);
        }
    };

    const handleCopy = async () => {
        if (!selectedCard?.content) return;
        try {
            await navigator.clipboard.writeText(selectedCard.content);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        } catch (err) {
            console.error('Copy failed', err);
        }
    };

    const handleBack = () => {
        setView('list');
        setSelectedCard(null);
        setIsExtending(false);
        setError('');
        if (activeTab === 'recent') {
            fetchRecentCards();
        }
    };

    const handleTabChange = (tab: Tab) => {
        setActiveTab(tab);
        setView('list');
        setError('');
        if (tab === 'pick' && pickedCards.length === 0) {
            fetchPickedCards();
        }
    };

    // Detail View
    if (view === 'detail' && selectedCard) {
        return (
            <div className="flex flex-col h-full bg-white relative">
                {/* Secondary Header - Detail specific */}
                <div className="px-4 py-3 border-b flex items-center justify-between sticky top-0 bg-white/80 backdrop-blur-md z-20 shrink-0">
                    <div className="flex items-center gap-3 overflow-hidden">
                        <button
                            onClick={handleBack}
                            className="p-1.5 -ml-1.5 hover:bg-gray-100 rounded-full transition-colors text-gray-500"
                        >
                            <ArrowLeft className="h-5 w-5" />
                        </button>
                        <h2 className="text-base font-semibold text-gray-900 truncate">
                            {selectedCard?.title || '卡片详情'}
                        </h2>
                    </div>
                    <button
                        onClick={handleCopy}
                        className="p-2 hover:bg-gray-50 text-gray-500 rounded-lg transition-colors"
                        title="复制全文"
                    >
                        {copied ? <Check className="h-4 w-4 text-green-600" /> : <Copy className="h-4 w-4" />}
                    </button>
                </div>

                {/* Content Area */}
                <div className="flex-1 overflow-y-auto p-5 scrollbar-thin">
                    {loading ? (
                        <div className="flex items-center justify-center py-12">
                            <Loader2 className="h-6 w-6 animate-spin text-gray-300" />
                        </div>
                    ) : (
                        <div className="space-y-8 pb-10">
                            {/* 1. Card Body - Minimalist Reading Experience */}
                            <div className="space-y-2">
                                <div className="text-[15px] leading-7 text-gray-700 whitespace-pre-wrap font-sans select-text">
                                    {selectedCard.content || '(无内容)'}
                                </div>
                                {selectedCard.updated && (
                                    <div className="text-xs text-gray-300 font-normal pt-4">
                                        更新于 {new Date(selectedCard.updated).toLocaleString('zh-CN')}
                                    </div>
                                )}
                            </div>

                            {/* Divider line for Append Section */}
                            <div className="border-t border-dashed border-gray-100 w-full" />

                            {/* 2. Input Area - Integrated */}
                            <div className="space-y-4 pt-1">
                                {!isExtending ? (
                                    <button
                                        onClick={() => setIsExtending(true)}
                                        className="w-full py-3 border border-dashed border-gray-200 rounded-xl text-sm text-gray-400 hover:text-teal-600 hover:border-teal-200 hover:bg-teal-50/30 transition-all flex items-center justify-center gap-2 group"
                                    >
                                        <Plus className="h-4 w-4 group-hover:scale-110 transition-transform" />
                                        添加内容或扩展
                                    </button>
                                ) : (
                                    <div className="animate-in fade-in slide-in-from-bottom-2 duration-200">
                                        <div className="space-y-3">
                                            <input
                                                type="text"
                                                placeholder="标题（可选，仅用于扩展新卡片）"
                                                value={extensionTitle}
                                                onChange={(e) => setExtensionTitle(e.target.value)}
                                                className="w-full bg-transparent border-b border-gray-100 px-1 py-2 text-sm focus:outline-none focus:border-teal-500 transition-colors placeholder:text-gray-300"
                                            />
                                            <textarea
                                                placeholder="输入想法..."
                                                value={extensionContent}
                                                onChange={(e) => setExtensionContent(e.target.value)}
                                                rows={4}
                                                autoFocus
                                                className="w-full bg-transparent border border-gray-100 rounded-lg p-3 text-sm focus:outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500/20 transition-all resize-none placeholder:text-gray-300 leading-relaxed block"
                                            />
                                        </div>

                                        {/* 3. Action Toolbar Action Buttons */}
                                        <div className="flex items-center gap-3 mt-4">
                                            <button
                                                onClick={() => {
                                                    setIsExtending(false);
                                                    setExtensionContent('');
                                                    setExtensionTitle('');
                                                }}
                                                className="px-4 py-2 text-xs font-medium text-gray-400 hover:text-gray-600 transition-colors"
                                            >
                                                取消
                                            </button>
                                            <div className="flex-1" />
                                            <button
                                                onClick={handleExtend}
                                                disabled={saving || !extensionContent.trim()}
                                                className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-medium text-teal-600 border border-teal-100 hover:bg-teal-50 transition-colors disabled:opacity-50"
                                                title="创建子卡片"
                                            >
                                                {status === 'success' ? <Check className="h-3.5 w-3.5" /> : <FilePlus className="h-3.5 w-3.5" />}
                                                扩展
                                            </button>
                                            <button
                                                onClick={handleAppend}
                                                disabled={saving || !extensionContent.trim()}
                                                className="flex items-center gap-1.5 px-5 py-2 rounded-lg text-xs font-medium text-white bg-teal-600 hover:bg-teal-700 shadow-sm shadow-teal-200 transition-all disabled:opacity-50 disabled:shadow-none"
                                                title="追加到当前卡片"
                                            >
                                                {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CornerDownLeft className="h-3.5 w-3.5" />}
                                                追加
                                            </button>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}
                </div>
            </div>
        );
    }

    // List View
    return (
        <div className="flex flex-col h-full bg-white relative">
            {/* 1. Header: Tabs & Space Filter */}
            <div className="px-4 py-3 border-b border-gray-50 flex items-center justify-between bg-white z-10 sticky top-0">
                {/* Tabs */}
                <div className="flex items-center gap-4">
                    <button
                        onClick={() => handleTabChange('recent')}
                        className={`text-sm font-semibold transition-colors relative ${activeTab === 'recent'
                            ? 'text-gray-900'
                            : 'text-gray-400 hover:text-gray-600'
                            }`}
                    >
                        最近
                        {activeTab === 'recent' && (
                            <div className="absolute -bottom-[13px] left-0 right-0 h-0.5 bg-teal-500 rounded-full" />
                        )}
                    </button>
                    <button
                        onClick={() => handleTabChange('pick')}
                        className={`text-sm font-semibold transition-colors relative flex items-center gap-1 ${activeTab === 'pick'
                            ? 'text-gray-900'
                            : 'text-gray-400 hover:text-gray-600'
                            }`}
                    >
                        <Sparkles className="h-3.5 w-3.5" />
                        拾贝
                        {activeTab === 'pick' && (
                            <div className="absolute -bottom-[13px] left-0 right-0 h-0.5 bg-teal-500 rounded-full" />
                        )}
                    </button>
                </div>

                {/* Space Selector (Micro) */}
                {/* Right Side Actions */}
                <div className="flex items-center gap-1">
                    <button
                        onClick={() => activeTab === 'recent' ? fetchRecentCards() : fetchPickedCards()}
                        className="p-1.5 text-gray-400 hover:text-teal-600 transition-colors rounded-md hover:bg-gray-50"
                        title="刷新"
                        disabled={loading}
                    >
                        <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
                    </button>

                    {spaces.length > 0 && (
                        <select
                            value={selectedSpace}
                            onChange={async (e) => {
                                const newSpaceId = e.target.value;
                                setSelectedSpace(newSpaceId);
                                const spaceName = spaces.find(s => (s._id || s.id) === newSpaceId)?.title || '默认空间';
                                await storage.set({ selectedSpaceId: newSpaceId, selectedSpaceName: spaceName });
                            }}
                            className="bg-transparent text-xs text-gray-400 hover:text-teal-600 font-medium focus:outline-none cursor-pointer transition-colors dir-rtl text-right max-w-[80px]"
                        >
                            <option value="">所有空间</option>
                            {spaces.map(s => {
                                const title = s.title.length > 8 ? s.title.substring(0, 8) + '..' : s.title;
                                return <option key={s._id || s.id} value={s._id || s.id}>{title}</option>;
                            })}
                        </select>
                    )}
                </div>
            </div>

            {/* 2. Search & Tools */}
            <div className="px-4 py-3 bg-white">
                {activeTab === 'recent' ? (
                    <div className="relative group">
                        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-300 group-focus-within:text-teal-500 transition-colors" />
                        <input
                            type="text"
                            placeholder="搜索卡片..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="w-full h-9 pl-9 pr-8 bg-gray-50 border-none rounded-lg text-sm focus:ring-1 focus:ring-teal-100 focus:bg-white transition-all placeholder:text-gray-400"
                        />
                        {searchQuery && (
                            <button
                                onClick={() => setSearchQuery('')}
                                className="absolute right-2.5 top-1/2 transform -translate-y-1/2 p-0.5 hover:bg-gray-200 rounded-full text-gray-400"
                            >
                                <X className="h-3 w-3" />
                            </button>
                        )}
                    </div>
                ) : (
                    <button
                        onClick={fetchPickedCards}
                        disabled={loading}
                        className="w-full py-2 bg-gradient-to-r from-teal-50 to-white border border-teal-50 rounded-lg text-xs font-medium text-teal-600 hover:from-teal-100 hover:to-teal-50 transition-all flex items-center justify-center gap-1.5 shadow-sm"
                    >
                        {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                        换一批灵感
                    </button>
                )}
            </div>

            {/* Error Message */}
            {error && (
                <div className="mx-4 mb-2 p-3 bg-red-50 border border-red-100 rounded-lg text-red-600 text-xs flex items-center gap-2">
                    <span className="w-1 h-1 bg-red-400 rounded-full" />
                    {error}
                </div>
            )}

            {/* 3. Card List */}
            <div className="flex-1 overflow-y-auto scrollbar-thin">
                {activeTab === 'recent' ? (
                    // Recent Cards
                    filteredCards.length === 0 && !loading ? (
                        <div className="flex flex-col items-center justify-center h-48 text-gray-300 text-sm gap-2">
                            <Search className="h-8 w-8 opacity-20" />
                            <span>{searchQuery ? '没有找到相关卡片' : '暂无最近卡片'}</span>
                        </div>
                    ) : (
                        <div className="pb-4">
                            {filteredCards.map((card) => (
                                <button
                                    key={card._id || card.id}
                                    onClick={() => handleCardClick(card)}
                                    className="w-full text-left px-4 py-3 hover:bg-gray-50 flex items-start justify-between group transition-all border-b border-gray-50 last:border-0"
                                >
                                    <div className="flex-1 min-w-0 pr-3">
                                        <h3 className="text-sm font-medium text-gray-700 group-hover:text-teal-700 transition-colors truncate">
                                            {card.title || '无标题'}
                                        </h3>
                                        <p className="text-[10px] text-gray-400 mt-1 truncate font-mono opacity-60">
                                            {card.updated ? new Date(card.updated).toLocaleDateString() : ''}
                                            {card.content ? ' · ' + card.content.substring(0, 20).replace(/\n/g, ' ') : ''}
                                        </p>
                                    </div>
                                    <ChevronRight className="h-4 w-4 text-gray-200 group-hover:text-teal-400 transition-colors shrink-0 mt-0.5" />
                                </button>
                            ))}
                            {loading && (
                                <div className="flex justify-center py-4">
                                    <Loader2 className="h-5 w-5 animate-spin text-gray-300" />
                                </div>
                            )}
                        </div>
                    )
                ) : (
                    // Picked Cards
                    loading && pickedCards.length === 0 ? (
                        <div className="flex items-center justify-center h-48">
                            <Loader2 className="h-6 w-6 animate-spin text-teal-200" />
                        </div>
                    ) : pickedCards.length === 0 ? (
                        <div className="flex flex-col items-center justify-center h-48 text-gray-300 text-sm gap-2">
                            <Sparkles className="h-8 w-8 opacity-20" />
                            <p>点击上方按钮获取灵感</p>
                        </div>
                    ) : (
                        <div className="p-4 space-y-3 pb-8">
                            {pickedCards.map((card, index) => (
                                <div
                                    key={card._id || card.id || index}
                                    onClick={() => handleCardClick(card)}
                                    className="group relative bg-white rounded-xl p-4 border border-gray-100 hover:border-teal-200 hover:shadow-md hover:shadow-teal-50 transition-all cursor-pointer overflow-hidden"
                                >
                                    <div className="absolute top-0 left-0 w-1 h-full bg-teal-500 opacity-0 group-hover:opacity-100 transition-opacity" />
                                    <h3 className="text-sm font-bold text-gray-800 mb-2 truncate pr-4">
                                        {card.title || '无标题'}
                                    </h3>
                                    <p className="text-xs text-gray-500 line-clamp-3 leading-relaxed font-serif">
                                        {card.content}
                                    </p>
                                    <div className="mt-3 flex items-center justify-between text-[10px] text-gray-300">
                                        <span>随机漫步</span>
                                        <span className="group-hover:text-teal-500 transition-colors">查看详情 &rarr;</span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )
                )}
            </div>
        </div>
    );
};

export default Recent;
