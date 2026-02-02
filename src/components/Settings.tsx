import React, { useState, useEffect } from 'react';
import { storage } from '../utils/storage';
import { WriteathonClient } from '../utils/api';
import { Loader2, CheckCircle, XCircle, ArrowLeft, Keyboard, Send, Sparkles, X } from 'lucide-react';

interface Shortcuts {
    quickSend: string;
    globalClip: string;
}

interface EnabledModules {
    memo: boolean;
    recent: boolean;
    clip: boolean;
    prompt: boolean;
    chat: boolean;
}

const DEFAULT_ENABLED_MODULES: EnabledModules = {
    memo: true,
    recent: true,
    clip: true,
    prompt: true,
    chat: true
};

interface AIProviderConfig {
    apiKey: string;
    model: string;
    baseUrl?: string;
}

interface AIConfig {
    activeProvider: 'openai' | 'gemini' | 'deepseek' | 'doubao' | 'custom';
    providers: {
        openai: AIProviderConfig;
        gemini: AIProviderConfig;
        deepseek: AIProviderConfig;
        doubao: AIProviderConfig;
        custom: AIProviderConfig & { baseUrl: string };
    };
}

const DEFAULT_AI_CONFIG: AIConfig = {
    activeProvider: 'openai',
    providers: {
        openai: { apiKey: '', model: 'gpt-4o-mini' },
        gemini: { apiKey: '', model: 'gemini-2.0-flash' },
        deepseek: { apiKey: '', model: 'deepseek-chat', baseUrl: 'https://api.deepseek.com' },
        doubao: { apiKey: '', model: '', baseUrl: 'https://ark.cn-beijing.volces.com/api/v3' },
        custom: { apiKey: '', model: '', baseUrl: '' }
    }
};

const PRESETS = {
    openai: ['gpt-4o', 'gpt-4o-mini', 'o1-preview', 'o1-mini', 'gpt-5-preview'],
    gemini: ['gemini-2.0-pro-exp', 'gemini-2.0-flash', 'gemini-1.5-pro', 'gemini-1.5-flash', 'gemini-exp-1206'],
    deepseek: ['deepseek-chat', 'deepseek-v3', 'deepseek-r1'],
    doubao: ['ep-2025...', 'ep-2024...']
};

const DEFAULT_SHORTCUTS: Shortcuts = {
    quickSend: 'Ctrl+Enter',
    globalClip: 'Alt+S'
};

interface SettingsProps {
    onSuccess: () => void;
    onBack?: () => void;
    isAuthenticated?: boolean;
}

const Settings: React.FC<SettingsProps> = ({ onSuccess, onBack, isAuthenticated }) => {
    const [token, setToken] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [status, setStatus] = useState<'idle' | 'connected'>('idle');
    const [username, setUsername] = useState('');
    const [shortcuts, setShortcuts] = useState<Shortcuts>(DEFAULT_SHORTCUTS);
    const [savingShortcuts, setSavingShortcuts] = useState(false);
    const [enabledModules, setEnabledModules] = useState<EnabledModules>(DEFAULT_ENABLED_MODULES);
    const [savingModules, setSavingModules] = useState(false);
    const [imgbbApiKey, setImgbbApiKey] = useState('');
    const [savingImgbb, setSavingImgbb] = useState(false);

    // AI 配置
    const [aiConfig, setAiConfig] = useState<AIConfig>(DEFAULT_AI_CONFIG);
    const [savingAi, setSavingAi] = useState(false);
    const [activeAiTab, setActiveAiTab] = useState<'openai' | 'gemini' | 'deepseek' | 'doubao' | 'custom'>('openai');

    useEffect(() => {
        const loadStored = async () => {
            const data = await storage.get();
            if (data.token) {
                setToken(data.token);
                if (data.username) {
                    setUsername(data.username);
                    setStatus('connected');
                }
            }
            if (data.shortcuts) {
                setShortcuts({ ...DEFAULT_SHORTCUTS, ...data.shortcuts });
            }
            if (data.enabledModules) {
                setEnabledModules({ ...DEFAULT_ENABLED_MODULES, ...data.enabledModules });
            }
            if (data.imgbbApiKey) {
                setImgbbApiKey(data.imgbbApiKey);
            }
            if (data.aiConfig) setAiConfig({
                ...DEFAULT_AI_CONFIG,
                ...data.aiConfig,
                providers: { ...DEFAULT_AI_CONFIG.providers, ...data.aiConfig.providers }
            });
        };
        loadStored();
    }, []);

    const handleConnect = async () => {
        if (!token) {
            setError('请输入集成 Token');
            return;
        }

        setLoading(true);
        setError('');

        try {
            const client = new WriteathonClient(token);
            const response = await client.getMe();

            if (response.success && response.data) {
                const { id, username } = response.data;
                await storage.set({ token, userId: id, username });
                setUsername(username);
                setStatus('connected');
                onSuccess();
            } else {
                setError(response.message || '连接失败，请检查 Token 是否正确');
            }
        } catch (err: any) {
            console.error('Connection error:', err);
            setError('网络错误，请检查网络连接后重试');
        } finally {
            setLoading(false);
        }
    };

    const handleDisconnect = async () => {
        await storage.clear();
        setToken('');
        setUsername('');
        setStatus('idle');
        setShortcuts(DEFAULT_SHORTCUTS);
        setImgbbApiKey('');
    };

    const handleImgbbChange = async (val: string) => {
        setImgbbApiKey(val);
        setSavingImgbb(true);
        await storage.set({ imgbbApiKey: val.trim() });
        setSavingImgbb(false);
    };

    const handleAiConfigChange = async (provider: string, field: string, value: string) => {
        const newConfig = { ...aiConfig };
        if (field === 'active') {
            newConfig.activeProvider = provider as any;
        } else {
            (newConfig.providers as any)[provider][field] = value;
        }
        setAiConfig(newConfig);
        setSavingAi(true);
        await storage.set({ aiConfig: newConfig });
        setSavingAi(false);
    };

    const handleShortcutChange = (key: keyof Shortcuts, value: string) => {
        const newShortcuts = { ...shortcuts, [key]: value };
        setShortcuts(newShortcuts);
        setSavingShortcuts(true);
        storage.set({ shortcuts: newShortcuts }).then(() => {
            setTimeout(() => setSavingShortcuts(false), 500);
        });
    };

    const handleModuleToggle = (key: keyof EnabledModules) => {
        const newModules = { ...enabledModules, [key]: !enabledModules[key] };
        setEnabledModules(newModules);
        setSavingModules(true);
        storage.set({ enabledModules: newModules }).then(() => {
            setTimeout(() => setSavingModules(false), 500);
        });
    };

    const ShortcutInput = ({ label, value, shortcutKey }: { label: string, value: string, shortcutKey: keyof Shortcuts }) => (
        <div className="flex items-center justify-between py-2">
            <span className="text-sm text-gray-700">{label}</span>
            <div className="relative group">
                <input
                    type="text"
                    value={value}
                    readOnly
                    className="w-32 px-2 py-1 text-xs text-center border rounded bg-gray-50 focus:outline-none focus:ring-2 focus:ring-teal-500 cursor-pointer hover:bg-white"
                    onKeyDown={(e) => {
                        e.preventDefault();
                        e.stopPropagation();

                        const parts = [];
                        if (e.ctrlKey) parts.push('Ctrl');
                        if (e.altKey) parts.push('Alt');
                        if (e.shiftKey) parts.push('Shift');
                        if (e.metaKey) parts.push('Meta');

                        let key = e.key.toUpperCase();
                        if (['CONTROL', 'ALT', 'SHIFT', 'META'].includes(key)) return;
                        if (key === ' ') key = 'Space';
                        if (key === 'ENTER') key = 'Enter';

                        parts.push(key);
                        if (parts.length > 0) {
                            handleShortcutChange(shortcutKey, parts.join('+'));
                        }
                    }}
                    placeholder="按下快捷键..."
                />
                <div className="absolute hidden group-hover:block bottom-full left-1/2 transform -translate-x-1/2 mb-1 px-2 py-1 bg-gray-800 text-white text-[10px] rounded whitespace-nowrap">
                    点击并按下快捷键
                </div>
            </div>
        </div>
    );

    return (
        <div className="flex flex-col gap-6 p-4">
            {/* Header with Back Button */}
            <div className="flex items-center gap-3">
                {isAuthenticated && onBack && (
                    <button
                        onClick={onBack}
                        className="p-2 hover:bg-gray-100 rounded-full transition-colors"
                        title="返回"
                    >
                        <ArrowLeft className="h-5 w-5 text-gray-600" />
                    </button>
                )}
                <div className="space-y-1">
                    <h2 className="text-xl font-semibold tracking-tight">设置</h2>
                    <p className="text-sm text-muted-foreground">
                        {status === 'connected' ? '管理你的账户连接' : '输入你的写拉松集成 Token 以连接账户'}
                    </p>
                </div>
            </div>

            {status === 'connected' ? (
                <div className="space-y-4">
                    <div className="flex items-center gap-2 p-3 bg-green-50 border border-green-200 rounded-lg text-green-700">
                        <CheckCircle className="h-5 w-5" />
                        <span className="text-sm font-medium">已连接为 {username}</span>
                    </div>
                    <button
                        onClick={handleDisconnect}
                        className="w-full flex items-center justify-center px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary"
                    >
                        断开连接
                    </button>
                </div>
            ) : (
                <div className="space-y-4">
                    <div className="space-y-2">
                        <label htmlFor="token" className="text-sm font-medium leading-none">
                            集成 Token
                        </label>
                        <input
                            id="token"
                            type="password"
                            placeholder="粘贴 Token..."
                            value={token}
                            onChange={(e) => setToken(e.target.value)}
                            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                        />
                    </div>

                    {error && (
                        <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
                            <XCircle className="h-4 w-4 shrink-0" />
                            <span>{error}</span>
                        </div>
                    )}

                    <button
                        onClick={handleConnect}
                        disabled={loading}
                        className="w-full flex items-center justify-center px-4 py-2 bg-teal-500 text-white rounded-md shadow-sm text-sm font-medium hover:bg-teal-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-teal-400 disabled:opacity-50"
                    >
                        {loading ? (
                            <>
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                正在连接...
                            </>
                        ) : (
                            '连接'
                        )}
                    </button>
                </div>
            )}

            {/* AI Configuration Section */}
            <div className="pt-4 border-t border-gray-100">
                <div className="flex items-center gap-2 mb-4">
                    <div className="p-1.5 bg-teal-50 text-teal-600 rounded-lg">
                        <Send size={16} />
                    </div>
                    <h4 className="text-sm font-bold text-gray-800">AI 助手配置</h4>
                </div>

                <div className="bg-gray-50 rounded-xl p-4 space-y-4">
                    {/* Provider Selector Tabs */}
                    <div className="flex bg-gray-200/50 p-1 rounded-lg">
                        {(['openai', 'gemini', 'deepseek', 'doubao', 'custom'] as const).map((p) => (
                            <button
                                key={p}
                                onClick={() => setActiveAiTab(p)}
                                className={`flex-1 py-1.5 text-[10px] font-bold rounded-md transition-all ${activeAiTab === p
                                    ? 'bg-white text-teal-600 shadow-sm'
                                    : 'text-gray-500 hover:text-gray-700'
                                    }`}
                            >
                                {p === 'openai' ? 'OpenAI' : p === 'gemini' ? 'Gemini' : p === 'deepseek' ? 'DeepSeek' : p === 'doubao' ? '豆包' : '自定义'}
                            </button>
                        ))}
                    </div>

                    {/* Current Provider Settings */}
                    <div className="space-y-3 animate-in fade-in duration-300">
                        <div>
                            <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1 px-1">API Key</label>
                            <input
                                type="password"
                                value={aiConfig.providers[activeAiTab].apiKey}
                                onChange={(e) => handleAiConfigChange(activeAiTab, 'apiKey', e.target.value)}
                                placeholder={`${activeAiTab} API Key`}
                                className="w-full h-9 px-3 rounded-lg border border-gray-200 bg-white text-xs focus:border-teal-500 focus:ring-1 focus:ring-teal-500 outline-none transition-all font-mono"
                            />
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                            <div className="relative">
                                <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1 px-1">模型名称</label>
                                {activeAiTab !== 'custom' && activeAiTab !== 'doubao' ? (
                                    <div className="relative">
                                        <select
                                            value={PRESETS[activeAiTab as keyof typeof PRESETS].includes(aiConfig.providers[activeAiTab].model) ? aiConfig.providers[activeAiTab].model : 'custom'}
                                            onChange={(e) => {
                                                const val = e.target.value;
                                                if (val !== 'custom') {
                                                    handleAiConfigChange(activeAiTab, 'model', val);
                                                } else {
                                                    // 选自定义且当前值已经在预设里时，才清空让用户输入。
                                                    // 如果当前值不在预设里，说明已经在自定义输入状态了，保持不动。
                                                    if (PRESETS[activeAiTab as keyof typeof PRESETS].includes(aiConfig.providers[activeAiTab].model)) {
                                                        handleAiConfigChange(activeAiTab, 'model', '');
                                                    }
                                                }
                                            }}
                                            className="w-full h-9 px-2 rounded-lg border border-gray-200 bg-white text-xs focus:border-teal-500 focus:ring-1 focus:ring-teal-500 outline-none transition-all appearance-none cursor-pointer"
                                        >
                                            {(PRESETS as any)[activeAiTab].map((m: string) => (
                                                <option key={m} value={m}>{m}</option>
                                            ))}
                                            <option value="custom">✍️ 自定义输入内容...</option>
                                        </select>

                                        {/* 如果当前模型不在预设列表中，或者显式处于自定义状态，则覆盖显示输入框 */}
                                        {(!PRESETS[activeAiTab as keyof typeof PRESETS].includes(aiConfig.providers[activeAiTab].model)) && (
                                            <div className="absolute inset-0 z-10">
                                                <input
                                                    type="text"
                                                    autoFocus
                                                    value={aiConfig.providers[activeAiTab].model}
                                                    placeholder="输入模型名称..."
                                                    onChange={(e) => handleAiConfigChange(activeAiTab, 'model', e.target.value)}
                                                    className="w-full h-9 px-3 pr-8 rounded-lg border border-teal-500 bg-white text-xs focus:ring-1 focus:ring-teal-500 outline-none"
                                                />
                                                <button
                                                    onClick={() => handleAiConfigChange(activeAiTab, 'model', PRESETS[activeAiTab as keyof typeof PRESETS][0])}
                                                    className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-red-500 p-1"
                                                    title="返回预设列表"
                                                >
                                                    <X size={12} />
                                                </button>
                                            </div>
                                        )}
                                    </div>
                                ) : (
                                    <input
                                        type="text"
                                        value={aiConfig.providers[activeAiTab].model}
                                        onChange={(e) => handleAiConfigChange(activeAiTab, 'model', e.target.value)}
                                        placeholder={activeAiTab === 'doubao' ? 'Endpoint ID (ep-xxx)' : '如: gpt-4o'}
                                        className="w-full h-9 px-3 rounded-lg border border-gray-200 bg-white text-xs focus:border-teal-500 focus:ring-1 focus:ring-teal-500 outline-none transition-all"
                                    />
                                )}
                            </div>
                            <div className="flex flex-col justify-end">
                                <button
                                    onClick={() => handleAiConfigChange(activeAiTab, 'active', '')}
                                    disabled={aiConfig.activeProvider === activeAiTab}
                                    className={`h-9 px-3 rounded-lg text-xs font-bold transition-all ${aiConfig.activeProvider === activeAiTab
                                        ? 'bg-teal-600 text-white truncate'
                                        : 'bg-white border border-gray-200 text-gray-600 hover:border-teal-500 hover:text-teal-600'
                                        }`}
                                >
                                    {aiConfig.activeProvider === activeAiTab ? '当前使用中' : '设为默认'}
                                </button>
                            </div>
                        </div>

                        {(activeAiTab === 'custom' || aiConfig.providers[activeAiTab].baseUrl) && (
                            <div>
                                <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1 px-1">接口地址 (Base URL)</label>
                                <input
                                    type="text"
                                    value={aiConfig.providers[activeAiTab].baseUrl || ''}
                                    onChange={(e) => handleAiConfigChange(activeAiTab, 'baseUrl', e.target.value)}
                                    placeholder="https://api.openai.com/v1"
                                    className="w-full h-9 px-3 rounded-lg border border-gray-200 bg-white text-xs focus:border-teal-500 focus:ring-1 focus:ring-teal-500 outline-none transition-all font-mono"
                                />
                            </div>
                        )}

                        {savingAi && <div className="text-[10px] text-teal-500 animate-pulse">正在保存 AI 配置...</div>}
                    </div>
                </div>
            </div>

            {/* Section Management */}
            {status === 'connected' && (
                <div className="space-y-4 pt-4 border-t border-gray-100">
                    <div className="flex items-center gap-2">
                        <div className="p-1.5 bg-teal-50 text-teal-600 rounded-lg">
                            <Sparkles size={16} />
                        </div>
                        <h3 className="text-sm font-bold text-gray-800">模块显示管理</h3>
                        {savingModules && <span className="text-[10px] text-teal-600 animate-pulse">已保存</span>}
                    </div>
                    <div className="grid grid-cols-2 gap-2 bg-gray-50 rounded-xl p-3">
                        {(Object.keys(DEFAULT_ENABLED_MODULES) as Array<keyof EnabledModules>).map((key) => (
                            <button
                                key={key}
                                onClick={() => handleModuleToggle(key)}
                                className={`flex items-center justify-between p-2.5 rounded-lg border transition-all ${enabledModules[key]
                                    ? 'bg-white border-teal-200 text-teal-700 shadow-sm'
                                    : 'bg-gray-100/50 border-gray-200 text-gray-400 opacity-60'
                                    }`}
                            >
                                <span className="text-[10px] font-bold uppercase tracking-wider">
                                    {key === 'memo' ? '速记' : key === 'recent' ? '最近' : key === 'clip' ? '剪藏' : key === 'prompt' ? 'Prompt' : 'AI Chat'}
                                </span>
                                <div className={`w-6 h-3.5 rounded-full relative transition-colors ${enabledModules[key] ? 'bg-teal-500' : 'bg-gray-300'}`}>
                                    <div className={`absolute top-0.5 w-2.5 h-2.5 bg-white rounded-full transition-all ${enabledModules[key] ? 'left-3' : 'left-0.5'}`} />
                                </div>
                            </button>
                        ))}
                    </div>
                    <p className="text-[10px] text-gray-400 px-1">关闭不常用的板块可以使侧边栏更加清爽。</p>
                </div>
            )}

            {/* Shortcuts Section */}
            {status === 'connected' && (
                <div className="space-y-4 pt-4 border-t border-gray-100">
                    <div className="flex items-center gap-2">
                        <div className="p-1.5 bg-teal-50 text-teal-600 rounded-lg">
                            <Keyboard size={16} />
                        </div>
                        <h3 className="text-sm font-bold text-gray-800">快捷键设置</h3>
                        {savingShortcuts && <span className="text-[10px] text-teal-600 animate-pulse">已保存</span>}
                    </div>
                    <div className="space-y-1 bg-white rounded-xl border border-gray-100 p-4 shadow-sm">
                        <div className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-3">操作</div>
                        <ShortcutInput label="发送/保存 (速记/剪藏)" value={shortcuts.quickSend} shortcutKey="quickSend" />
                        <ShortcutInput label="全局选取剪藏 (网页中)" value={shortcuts.globalClip} shortcutKey="globalClip" />
                    </div>
                    <p className="text-[10px] text-gray-400 px-1">
                        * 全局快捷键在任何网页都可触发（需刷新网页生效）
                    </p>
                </div>
            )}

            {/* ImgBB API Key Section */}
            {status === 'connected' && (
                <div className="space-y-4 pt-4 border-t border-gray-100">
                    <div className="flex items-center gap-2">
                        <span className="text-lg">🖼️</span>
                        <h3 className="text-sm font-medium text-gray-900">图床设置 (imgbb)</h3>
                        {savingImgbb && <span className="text-[10px] text-green-600 animate-pulse">已保存</span>}
                    </div>
                    <div className="space-y-2 bg-white rounded-lg border border-gray-100 p-3">
                        <label className="text-xs text-gray-500">图床 API Key</label>
                        <input
                            type="password"
                            value={imgbbApiKey}
                            onChange={(e) => handleImgbbChange(e.target.value)}
                            placeholder="粘贴 imgbb API Key..."
                            className="w-full px-3 py-2 text-sm border rounded-md bg-gray-50 focus:outline-none focus:ring-2 focus:ring-teal-500"
                        />
                        <p className="text-[10px] text-gray-400">
                            用于上传截图到图床。请在 <a href="https://api.imgbb.com/" target="_blank" rel="noopener noreferrer" className="text-teal-600 hover:underline">api.imgbb.com</a> 注册并获取。
                        </p>
                    </div>
                </div>
            )}

            <div className="mt-8 pt-6 border-t border-gray-100 text-xs text-gray-400">
                你可以在写拉松「设置 → 集成」中生成 Token
            </div>
        </div>
    );
};

export default Settings;
