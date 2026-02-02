import React, { useState, useEffect } from 'react';
import { WriteathonClient, Card, Space } from '../utils/api';
import { storage } from '../utils/storage';
import { Loader2, ArrowLeft, Send, Check, ChevronRight, Search, Edit3, Plus, Save, X, Sparkles, RefreshCw, Copy } from 'lucide-react';

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
                // Use selectedSpace if available
                const response = await client.getRecentCards(false, selectedSpace || undefined);
                if (response.success && response.data) {
                    setCards(response.data);
                    setFilteredCards(response.data);
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
            <div className="flex flex-col h-full bg-[#fafafa]">
                {/* Header */}
                <div className="p-4 bg-white border-b sticky top-0 z-10 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <button
                            onClick={handleBack}
                            className="p-1 hover:bg-muted rounded-full transition-colors"
                        >
                            <ArrowLeft className="h-5 w-5" />
                        </button>
                        <h2 className="text-sm font-bold uppercase tracking-widest text-black truncate max-w-[200px]">
                            {selectedCard?.title || '卡片详情'}
                        </h2>
                    </div>

                    {/* Action Buttons */}
                    <div className="flex items-center gap-2">
                        <button
                            onClick={handleCopy}
                            className="p-2 hover:bg-gray-100 text-gray-600 rounded-lg transition-colors"
                            title="复制内容"
                        >
                            {copied ? <Check className="h-4 w-4 text-green-600" /> : <Copy className="h-4 w-4" />}
                        </button>
                        {!isExtending && (
                            <>
                                <button
                                    onClick={() => setIsExtending(true)}
                                    className="p-2 hover:bg-green-50 text-green-600 rounded-lg transition-colors"
                                    title="追加内容"
                                >
                                    <Plus className="h-4 w-4" />
                                </button>
                            </>
                        )}
                    </div>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto p-4 space-y-4">
                    {loading ? (
                        <div className="flex items-center justify-center py-8">
                            <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
                        </div>
                    ) : (
                        <>
                            {/* Card Content Display Only */}
                            <div className="bg-white rounded-lg border border-gray-100 p-4 space-y-3">
                                <h3 className="font-medium text-gray-900">
                                    {selectedCard.title || '无标题'}
                                </h3>
                                <div className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed font-mono select-text">
                                    {selectedCard.content || '(无内容)'}
                                </div>
                                {selectedCard.updated && (
                                    <div className="text-xs text-gray-400 pt-2 border-t border-gray-100">
                                        更新于: {new Date(selectedCard.updated).toLocaleString('zh-CN')}
                                    </div>
                                )}
                            </div>

                            {/* Extend Section */}
                            {isExtending && (
                                <div className="space-y-3 bg-green-50 p-4 rounded-lg border border-green-100">
                                    <label className="text-[10px] font-bold text-green-700 uppercase tracking-widest flex items-center gap-1">
                                        <Plus className="h-3 w-3" />
                                        添加内容
                                    </label>
                                    <input
                                        type="text"
                                        placeholder="标题（可选，仅用于扩展卡片）"
                                        value={extensionTitle}
                                        onChange={(e) => setExtensionTitle(e.target.value)}
                                        className="flex h-10 w-full rounded-md border border-green-200 bg-white px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-300"
                                    />
                                    <textarea
                                        placeholder="输入要追加的内容..."
                                        value={extensionContent}
                                        onChange={(e) => setExtensionContent(e.target.value)}
                                        rows={5}
                                        className="flex w-full rounded-md border border-green-200 bg-white px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-300 resize-none"
                                    />
                                </div>
                            )}

                            {/* Error Message */}
                            {error && (
                                <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-xs">
                                    {error}
                                </div>
                            )}

                            {/* Action Buttons */}
                            {/* Action Buttons */}
                            {isExtending && (
                                <div className="flex gap-2">
                                    <button
                                        onClick={() => {
                                            setIsExtending(false);
                                            setExtensionContent('');
                                            setExtensionTitle('');
                                        }}
                                        className="flex-1 flex items-center justify-center gap-2 px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50"
                                    >
                                        取消
                                    </button>

                                    <button
                                        onClick={handleAppend}
                                        disabled={saving || !extensionContent.trim()}
                                        className={`flex-1 flex items-center justify-center gap-1 px-2 py-2 rounded-md text-xs font-medium text-white transition-colors disabled:opacity-50 bg-teal-600 hover:bg-teal-700`}
                                        title="追加内容到当前卡片末尾"
                                    >
                                        <div className="flex flex-col items-center">
                                            <span className="font-bold">追加</span>
                                            <span className="text-[9px] opacity-80">到本卡片</span>
                                        </div>
                                    </button>
                                    <button
                                        onClick={handleExtend}
                                        disabled={saving || !extensionContent.trim()}
                                        className={`flex-1 flex items-center justify-center gap-1 px-2 py-2 rounded-md text-xs font-medium text-white transition-colors disabled:opacity-50 ${status === 'success'
                                            ? 'bg-green-600'
                                            : 'bg-green-600 hover:bg-green-700'
                                            }`}
                                        title="创建一张新的子卡片连接到当前卡片"
                                    >
                                        {status === 'success' ? (
                                            <div className="flex items-center gap-1">
                                                <Check className="h-3 w-3" /> 已保存
                                            </div>
                                        ) : (
                                            <div className="flex flex-col items-center">
                                                <span className="font-bold">扩展</span>
                                                <span className="text-[9px] opacity-80">新建子卡片</span>
                                            </div>
                                        )}
                                    </button>
                                </div>
                            )}
                        </>
                    )}
                </div>
            </div >
        );
    }

    // List View
    return (
        <div className="flex flex-col h-full bg-[#fafafa]">
            {/* Tab Navigation */}
            <div className="p-4 bg-white border-b space-y-3">
                <div className="flex gap-2">
                    <button
                        onClick={() => handleTabChange('recent')}
                        className={`flex-1 py-2 px-2 rounded-lg text-sm font-medium transition-colors ${activeTab === 'recent'
                            ? 'bg-teal-500 text-white'
                            : 'bg-teal-50 text-teal-600 hover:bg-teal-100'
                            }`}
                    >
                        最近
                    </button>
                    <button
                        onClick={() => handleTabChange('pick')}
                        className={`flex-1 py-2 px-2 rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-1 ${activeTab === 'pick'
                            ? 'bg-gradient-to-r from-teal-400 to-teal-600 text-white'
                            : 'bg-teal-50 text-teal-600 hover:bg-teal-100'
                            }`}
                    >
                        <Sparkles className="h-3 w-3" />
                        拾贝
                    </button>
                </div>
                {/* Space Selector */}
                {spaces.length > 0 && (
                    <select
                        value={selectedSpace}
                        onChange={async (e) => {
                            const newSpaceId = e.target.value;
                            setSelectedSpace(newSpaceId);
                            const spaceName = spaces.find(s => (s._id || s.id) === newSpaceId)?.title || '默认空间';
                            await storage.set({ selectedSpaceId: newSpaceId, selectedSpaceName: spaceName });
                        }}
                        className="w-full h-8 text-xs border border-gray-200 rounded-md px-2 bg-gray-50 focus:outline-none focus:ring-1 focus:ring-teal-500"
                    >
                        <option value="">所有空间 / 默认空间</option>
                        {spaces.filter(s => s.title !== '默认空间').map(s => (
                            <option key={s._id || s.id} value={s._id || s.id}>{s.title}</option>
                        ))}
                    </select>
                )}

                {/* Search Box and Refresh - Only for Recent */}
                {activeTab === 'recent' && (
                    <div className="flex gap-2">
                        <div className="relative flex-1">
                            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                            <input
                                type="text"
                                placeholder="搜索卡片..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                className="w-full h-10 pl-10 pr-4 rounded-lg border border-gray-200 bg-gray-50 text-sm focus:outline-none focus:ring-2 focus:ring-teal-100 focus:border-teal-300"
                            />
                            {searchQuery && (
                                <button
                                    onClick={() => setSearchQuery('')}
                                    className="absolute right-3 top-1/2 transform -translate-y-1/2 p-1 hover:bg-gray-200 rounded-full"
                                >
                                    <X className="h-3 w-3 text-gray-400" />
                                </button>
                            )}
                        </div>
                        <button
                            onClick={fetchRecentCards}
                            disabled={loading}
                            className="h-10 px-3 bg-gray-100 text-gray-600 rounded-lg hover:bg-gray-200 transition-colors flex items-center justify-center"
                            title="刷新"
                        >
                            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                        </button>
                    </div>
                )}

                {/* Refresh Button - For Pick */}
                {activeTab === 'pick' && (
                    <button
                        onClick={fetchPickedCards}
                        disabled={loading}
                        className="w-full py-2 px-4 bg-teal-50 text-teal-600 rounded-lg text-sm font-medium hover:bg-teal-100 transition-colors flex items-center justify-center gap-2"
                    >
                        {loading ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                            <RefreshCw className="h-4 w-4" />
                        )}
                        换一批
                    </button>
                )}
            </div>

            {/* Error Message */}
            {error && (
                <div className="mx-4 mt-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-xs">
                    {error}
                </div>
            )}

            {/* Card List */}
            <div className="flex-1 overflow-y-auto">
                {activeTab === 'recent' ? (
                    // Recent Cards
                    filteredCards.length === 0 && !loading ? (
                        <div className="p-8 text-center text-muted-foreground text-sm">
                            {searchQuery ? `未找到包含"${searchQuery}"的卡片` : '暂无卡片'}
                        </div>
                    ) : (
                        <div className="divide-y divide-gray-100">
                            {filteredCards.map((card) => (
                                <button
                                    key={card._id || card.id}
                                    onClick={() => handleCardClick(card)}
                                    className="w-full text-left p-4 hover:bg-gray-50 flex items-center justify-between group transition-colors bg-white"
                                >
                                    <div className="flex-1 min-w-0 pr-4">
                                        <h3 className="text-sm font-medium text-gray-900 truncate">
                                            {card.title || '无标题'}
                                        </h3>
                                    </div>
                                    <ChevronRight className="h-4 w-4 text-gray-300 group-hover:text-teal-500 transition-colors shrink-0" />
                                </button>
                            ))}
                        </div>
                    )
                ) : (
                    // Picked Cards
                    loading ? (
                        <div className="flex items-center justify-center py-12">
                            <Loader2 className="h-6 w-6 animate-spin text-teal-500" />
                        </div>
                    ) : pickedCards.length === 0 ? (
                        <div className="p-8 text-center text-muted-foreground text-sm">
                            <Sparkles className="h-8 w-8 mx-auto mb-3 text-teal-300" />
                            <p>点击「换一批」获取随机卡片</p>
                        </div>
                    ) : (
                        <div className="p-4 space-y-3">
                            {pickedCards.map((card, index) => (
                                <button
                                    key={card._id || card.id || index}
                                    onClick={() => handleCardClick(card)}
                                    className="w-full text-left p-4 bg-white rounded-lg border border-gray-100 hover:border-teal-200 hover:shadow-sm transition-all group"
                                >
                                    <div className="flex items-start justify-between gap-3">
                                        <div className="flex-1 min-w-0">
                                            <h3 className="text-sm font-medium text-gray-900 mb-2">
                                                {card.title || '无标题'}
                                            </h3>
                                            <p className="text-xs text-gray-500 line-clamp-3 leading-relaxed">
                                                {card.content?.substring(0, 150)}...
                                            </p>
                                        </div>
                                        <ChevronRight className="h-4 w-4 text-gray-300 group-hover:text-teal-500 transition-colors shrink-0 mt-1" />
                                    </div>
                                </button>
                            ))}
                        </div>
                    )
                )}
            </div>

            {/* Stats */}
            <div className="p-3 bg-white border-t text-xs text-gray-400 text-center">
                {activeTab === 'recent' ? (
                    <>
                        共 {filteredCards.length} 张卡片
                        {searchQuery && ` (从 ${cards.length} 张中筛选)`}
                    </>
                ) : (
                    pickedCards.length > 0 && `随机获取了 ${pickedCards.length} 张卡片`
                )}
            </div>
        </div>
    );
};

export default Recent;
