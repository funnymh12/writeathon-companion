import React, { useState, useEffect } from 'react';
import { WriteathonClient, Card, Space } from '../utils/api';
import { storage } from '../utils/storage';
import { formatLogFooter } from '../utils/textUtils';
import { Loader2, ArrowLeft, Send, Check, ChevronRight, Search, Edit3, Plus, Save, X, Sparkles, RefreshCw, Copy, FilePlus, CornerDownLeft, Clock } from 'lucide-react';

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
        // Filter cards based on search query (Title & Content)
        if (searchQuery.trim()) {
            const query = searchQuery.toLowerCase();
            const filtered = cards.filter(card =>
                (card.title && card.title.toLowerCase().includes(query)) ||
                (card.content && card.content.toLowerCase().includes(query))
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
                let allCards: Card[] = [];

                if (selectedSpace) {
                    // Fetch for specific space
                    const response = await client.getRecentCards(false, selectedSpace);
                    if (response.success && response.data) {
                        allCards = response.data;
                    }
                } else {
                    // Strategy for "All Spaces":
                    // 1. Fetch available spaces
                    const spacesRes = await client.getSpaces();
                    const spacesList = (spacesRes.success && spacesRes.data) ? spacesRes.data : [];

                    // 2. Build requests: one for "Default" (no ID) and one for each specific space
                    // We catch individual errors so one failure doesn't break everything
                    const promises = [
                        client.getRecentCards(false).catch(() => ({ success: false, data: [] } as any)),
                        ...spacesList.map(s =>
                            client.getRecentCards(false, s.id || s._id).catch(() => ({ success: false, data: [] } as any))
                        )
                    ];

                    const results = await Promise.all(promises);

                    // 3. Aggregate results
                    results.forEach(res => {
                        if (res.success && Array.isArray(res.data)) {
                            allCards.push(...res.data);
                        }
                    });
                }

                // 4. Deduplicate cards by ID
                const uniqueMap = new Map();
                allCards.forEach(card => {
                    const id = card._id || card.id;
                    if (id && !uniqueMap.has(id)) {
                        uniqueMap.set(id, card);
                    }
                });
                const uniqueCards = Array.from(uniqueMap.values());

                // 5. Sort by time (newest first) and take top 50
                uniqueCards.sort((a, b) => {
                    const tA = new Date(a.updated || a.created || 0).getTime();
                    const tB = new Date(b.updated || b.created || 0).getTime();
                    return tB - tA;
                });

                const finalCards = uniqueCards.slice(0, 50);

                setCards(finalCards);
                setFilteredCards(finalCards);

                // Trigger hydration to fetch content for these cards in background
                hydrateCards(finalCards);
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

    // Hydrate card contents in background to enable search and preview
    const hydrateCards = async (initialCards: Card[]) => {
        const toHydrate = initialCards.filter(c => !c.content); // Only fetch if missing content
        if (toHydrate.length === 0) return;

        try {
            const data = await storage.get();
            if (data.token && data.userId) {
                const client = new WriteathonClient(data.token, data.userId);

                // Fetch in batches to avoid rate limits
                const batchSize = 5;
                for (let i = 0; i < toHydrate.length; i += batchSize) {
                    const batch = toHydrate.slice(i, i + batchSize);

                    const promises = batch.map(card =>
                        client.getCardDetail(card._id || card.id || '').catch(() => ({ success: false, data: null } as any))
                    );

                    const results = await Promise.all(promises);

                    // Update state incrementally
                    setCards(prevCards => {
                        const newCards = [...prevCards];
                        let hasChanges = false;

                        results.forEach((res, idx) => {
                            if (res && res.success && res.data) {
                                const originalId = batch[idx]._id || batch[idx].id;
                                const targetIndex = newCards.findIndex(c => (c._id || c.id) === originalId);
                                if (targetIndex !== -1) {
                                    // Merge detail data (crucially, the content)
                                    newCards[targetIndex] = { ...newCards[targetIndex], ...res.data };
                                    hasChanges = true;
                                }
                            }
                        });
                        return hasChanges ? newCards : prevCards;
                    });

                    // Small delay between batches to be nice to API
                    await new Promise(r => setTimeout(r, 200));
                }
            }
        } catch (err) {
            console.warn('Hydration warning', err);
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
                    extensionContent + formatLogFooter(extensionContent),
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
                    content: extensionContent + formatLogFooter(extensionContent),
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
            <div className="flex flex-col h-full bg-transparent relative">
                {/* Secondary Header - Detail specific */}
                <div className="px-5 py-4 flex items-center justify-between sticky top-0 bg-transparent backdrop-blur-md z-20 shrink-0 border-b border-white/40">
                    <div className="flex items-center gap-2 overflow-hidden">
                        <button
                            onClick={handleBack}
                            className="p-1.5 -ml-2 hover:bg-white/50 rounded-xl transition-colors text-slate-500"
                        >
                            <ArrowLeft className="h-5 w-5" />
                        </button>
                        <h2 className="text-base font-bold text-slate-800 truncate">
                            {selectedCard?.title || '未命名'}
                        </h2>
                    </div>
                    <button
                        onClick={handleCopy}
                        className={`p-2 rounded-xl transition-all ${copied ? 'bg-green-50 text-green-600' : 'hover:bg-white/50 text-slate-400 hover:text-teal-600'}`}
                        title="复制全文"
                    >
                        {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                    </button>
                </div>

                {/* Content Area */}
                <div className="flex-1 overflow-y-auto p-6 scrollbar-thin">
                    {loading ? (
                        <div className="flex items-center justify-center py-12">
                            <Loader2 className="h-6 w-6 animate-spin text-teal-200" />
                        </div>
                    ) : (
                        <div className="space-y-8 pb-10">
                            {/* Card Body */}
                            <div className="space-y-3 animate-in fade-in slide-in-from-bottom-2 duration-300">
                                <div className="text-[15px] leading-8 text-slate-700 whitespace-pre-wrap font-serif select-text tracking-wide">
                                    {selectedCard.content || '(无内容)'}
                                </div>
                                {selectedCard.updated && (
                                    <div className="text-[10px] text-slate-400 flex items-center gap-1 pt-6 font-medium">
                                        <Clock className="w-3 h-3" />
                                        最后编辑: {new Date(selectedCard.updated).toLocaleString('zh-CN')}
                                    </div>
                                )}
                            </div>

                            {/* Action Area */}
                            <div className="pt-6">
                                <div className="border-t border-dashed border-gray-100 mb-6" />

                                {!isExtending ? (
                                    <button
                                        onClick={() => setIsExtending(true)}
                                        className="w-full py-4 rounded-xl border border-dashed border-gray-200 text-sm text-gray-400 font-medium hover:text-teal-600 hover:border-teal-200 hover:bg-teal-50/20 transition-all flex items-center justify-center gap-2 group"
                                    >
                                        <Plus className="h-4 w-4 group-hover:scale-110 transition-transform" />
                                        添加内容或扩展子卡片
                                    </button>
                                ) : (
                                    <div className="bg-gray-50/50 rounded-xl p-4 border border-gray-100 animate-in fade-in zoom-in-95 duration-200">
                                        <div className="space-y-3">
                                            <input
                                                type="text"
                                                placeholder="标题（可选，仅用于扩展新卡片）"
                                                value={extensionTitle}
                                                onChange={(e) => setExtensionTitle(e.target.value)}
                                                className="w-full bg-transparent border-b border-gray-200/50 px-1 py-2 text-sm font-bold text-gray-700 focus:outline-none focus:border-teal-500 transition-colors placeholder:text-gray-300 placeholder:font-normal"
                                            />
                                            <textarea
                                                placeholder="写下你的想法..."
                                                value={extensionContent}
                                                onChange={(e) => setExtensionContent(e.target.value)}
                                                rows={4}
                                                autoFocus
                                                className="w-full bg-transparent border-none p-1 text-sm text-gray-700 focus:outline-none focus:ring-0 resize-none placeholder:text-gray-300 leading-relaxed"
                                            />
                                        </div>

                                        {/* Toolbar */}
                                        <div className="flex items-center gap-2 mt-4 justify-end">
                                            <button
                                                onClick={() => {
                                                    setIsExtending(false);
                                                    setExtensionContent('');
                                                    setExtensionTitle('');
                                                }}
                                                className="px-3 py-1.5 text-xs font-medium text-gray-400 hover:text-gray-600 transition-colors"
                                            >
                                                取消
                                            </button>
                                            <button
                                                onClick={handleExtend}
                                                disabled={saving || !extensionContent.trim()}
                                                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-teal-600 bg-teal-50 hover:bg-teal-100 transition-colors disabled:opacity-50"
                                            >
                                                {status === 'success' ? <Check className="h-3.5 w-3.5" /> : <FilePlus className="h-3.5 w-3.5" />}
                                                扩展
                                            </button>
                                            <button
                                                onClick={handleAppend}
                                                disabled={saving || !extensionContent.trim()}
                                                className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-medium text-white bg-teal-500 hover:bg-teal-600 shadow-sm shadow-teal-200 transition-all disabled:opacity-50"
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
        <div className="flex flex-col h-full bg-transparent relative">
            {/* Header Area */}
            <div className="px-5 py-4 glass z-10 space-y-4">
                <div className="flex items-center justify-between">
                    <div className="p-1 bg-slate-100/50 rounded-xl flex gap-1">
                        <button
                            onClick={() => handleTabChange('recent')}
                            className={`px-4 py-1.5 text-xs font-semibold rounded-lg transition-all ${activeTab === 'recent'
                                ? 'bg-white shadow-sm text-teal-600 ring-1 ring-black/5'
                                : 'text-slate-400 hover:text-slate-600'
                                }`}
                        >
                            最近
                        </button>
                        <button
                            onClick={() => handleTabChange('pick')}
                            className={`px-4 py-1.5 text-xs font-semibold rounded-md transition-all flex items-center gap-1 ${activeTab === 'pick'
                                ? 'bg-white text-teal-600 shadow-sm'
                                : 'text-gray-400 hover:text-gray-600'
                                }`}
                        >
                            <Sparkles className="h-3 w-3" />
                            拾贝
                        </button>
                    </div>

                    <div className="flex items-center gap-2">
                        <button
                            onClick={() => activeTab === 'recent' ? fetchRecentCards() : fetchPickedCards()}
                            className="p-2 text-slate-400 hover:text-teal-600 transition-colors rounded-xl hover:bg-white/50"
                            title="刷新"
                            disabled={loading}
                        >
                            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                        </button>
                    </div>
                </div>

                {/* Filter / Search Bar */}
                <div className="flex items-center gap-3">
                    {/* Search */}
                    {activeTab === 'recent' ? (
                        <div className="relative flex-1 group">
                            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-3.5 w-3.5 text-gray-400 group-focus-within:text-teal-500 transition-colors" />
                            <input
                                type="text"
                                placeholder="搜索..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                className="w-full h-9 pl-9 pr-3 bg-gray-50/50 border border-gray-100 rounded-xl text-xs font-medium focus:outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500 transition-all placeholder:text-gray-400"
                            />
                            {searchQuery && (
                                <button
                                    onClick={() => setSearchQuery('')}
                                    className="absolute right-2 top-1/2 transform -translate-y-1/2 p-0.5 hover:bg-gray-200 rounded-full text-gray-400"
                                >
                                    <X className="h-3 w-3" />
                                </button>
                            )}
                        </div>
                    ) : (
                        <div className="flex-1 text-xs text-gray-400 pl-1">
                            随遇而安，偶遇灵感
                        </div>
                    )}

                    {/* Space Select */}
                    {spaces.length > 0 && activeTab === 'recent' && (
                        <div className="relative flex items-center text-xs">
                            <select
                                value={selectedSpace}
                                onChange={async (e) => {
                                    const newSpaceId = e.target.value;
                                    setSelectedSpace(newSpaceId);
                                    const spaceName = spaces.find(s => (s._id || s.id) === newSpaceId)?.title || '默认空间';
                                    await storage.set({ selectedSpaceId: newSpaceId, selectedSpaceName: spaceName });
                                }}
                                className="appearance-none bg-teal-50/50 hover:bg-teal-100/50 border border-teal-100/30 rounded-xl px-4 py-2 text-teal-700 font-bold transition-all pr-10 outline-none focus:ring-2 focus:ring-teal-500/10 cursor-pointer max-w-[130px] truncate"
                            >
                                <option value="">所有空间</option>
                                {spaces.map(s => {
                                    return <option key={s._id || s.id} value={s._id || s.id}>{s.title}</option>;
                                })}
                            </select>
                            <ChevronDown className="absolute right-3 h-4 w-4 text-teal-600 pointer-events-none" />
                        </div>
                    )}
                    {activeTab === 'pick' && (
                        <button
                            onClick={fetchPickedCards}
                            disabled={loading}
                            className="px-3 py-2 bg-teal-50 text-teal-600 rounded-xl text-xs font-semibold hover:bg-teal-100 transition-colors"
                        >
                            换一批
                        </button>
                    )}
                </div>
            </div>

            {/* Error Message */}
            {error && (
                <div className="px-5 mb-2">
                    <div className="p-3 bg-red-50/80 border border-red-100 rounded-xl text-red-500 text-xs flex items-center gap-2">
                        <span className="w-1.5 h-1.5 bg-red-400 rounded-full" />
                        {error}
                    </div>
                </div>
            )}

            {/* List Content */}
            <div className="flex-1 overflow-y-auto scrollbar-thin px-3 pb-4 space-y-2">
                {activeTab === 'recent' ? (
                    // Recent Cards
                    filteredCards.length === 0 && !loading ? (
                        <div className="flex flex-col items-center justify-center h-64 text-gray-300 gap-3">
                            <div className="p-4 bg-gray-50 rounded-full mb-1">
                                <Search className="h-6 w-6 opacity-40" />
                            </div>
                            <span className="text-xs font-medium">{searchQuery ? '没有找到相关卡片' : '暂无最近卡片'}</span>
                        </div>
                    ) : (
                        <>
                            {filteredCards.map((card) => (
                                <button
                                    key={card._id || card.id}
                                    onClick={() => handleCardClick(card)}
                                    className="w-full text-left p-4 bg-white/40 hover:bg-white/80 rounded-2xl group transition-all duration-300 border border-white/40 hover:border-white hover:shadow-sm"
                                >
                                    <div className="flex items-start justify-between gap-3">
                                        <div className="flex-1 min-w-0">
                                            <h3 className="text-sm font-bold text-slate-800 group-hover:text-teal-700 transition-colors truncate mb-1.5">
                                                {card.title || '无标题'}
                                            </h3>
                                            <p className="text-xs text-slate-500 line-clamp-2 leading-relaxed font-normal">
                                                {card.content ? (card.content.length > 80 ? card.content.substring(0, 80) + '...' : card.content) : '(无正文)'}
                                            </p>
                                        </div>
                                        {card.updated && (
                                            <span className="text-[10px] text-gray-300 whitespace-nowrap font-mono pt-1">
                                                {new Date(card.updated).toLocaleDateString(undefined, { month: 'numeric', day: 'numeric' })}
                                            </span>
                                        )}
                                    </div>
                                </button>
                            ))}
                            {loading && (
                                <div className="flex justify-center py-8">
                                    <Loader2 className="h-5 w-5 animate-spin text-gray-300" />
                                </div>
                            )}
                        </>
                    )
                ) : (
                    // Picked Cards
                    loading && pickedCards.length === 0 ? (
                        <div className="flex items-center justify-center h-64">
                            <Loader2 className="h-6 w-6 animate-spin text-teal-200" />
                        </div>
                    ) : pickedCards.length === 0 ? (
                        <div className="flex flex-col items-center justify-center h-64 text-gray-300 gap-3">
                            <div className="p-4 bg-gray-50 rounded-full mb-1">
                                <Sparkles className="h-6 w-6 opacity-40" />
                            </div>
                            <p className="text-xs">点击上方按钮获取灵感</p>
                        </div>
                    ) : (
                        <div className="space-y-3 pt-1">
                            {pickedCards.map((card, index) => (
                                <div
                                    key={card._id || card.id || index}
                                    onClick={() => handleCardClick(card)}
                                    className="group relative bg-white/60 hover:bg-white/90 rounded-2xl p-5 border border-white/40 hover:border-teal-200 hover:shadow-lg hover:shadow-teal-100/20 transition-all duration-300 cursor-pointer overflow-hidden backdrop-blur-sm"
                                >
                                    <div className="absolute top-0 left-0 w-1 h-full bg-teal-400 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                                    <h3 className="text-sm font-bold text-slate-800 mb-3 truncate pr-4">
                                        {card.title || '无标题'}
                                    </h3>
                                    <p className="text-xs text-slate-600 line-clamp-4 leading-relaxed font-serif tracking-wide opacity-80">
                                        {card.content}
                                    </p>
                                    <div className="mt-4 flex items-center justify-end">
                                        <span className="text-[10px] text-teal-500 opacity-0 group-hover:opacity-100 transition-all transform translate-x-2 group-hover:translate-x-0 flex items-center gap-1 font-medium">
                                            查看 <ArrowLeft className="h-3 w-3 rotate-180" />
                                        </span>
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

// Helper for space selector chevron
function ChevronDown({ className }: { className?: string }) {
    return (
        <svg
            className={className}
            xmlns="http://www.w3.org/2000/svg"
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
        >
            <path d="m6 9 6 6 6-6" />
        </svg>
    );
}

export default Recent;
