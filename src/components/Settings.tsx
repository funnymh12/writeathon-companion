import React, { useState, useEffect } from 'react';
import { storage } from '../utils/storage';
import { WriteathonClient } from '../utils/api';
import { Loader2, CheckCircle, XCircle, ArrowLeft, Keyboard } from 'lucide-react';

interface Shortcuts {
    toggleMemo: string;
    toggleRecent: string;
    toggleClip: string;
    togglePrompt: string;
    quickSend: string;
    globalClip: string;
}

const DEFAULT_SHORTCUTS: Shortcuts = {
    toggleMemo: 'Alt+1',
    toggleRecent: 'Alt+2',
    toggleClip: 'Alt+3',
    togglePrompt: 'Alt+4',
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
    const [imgbbApiKey, setImgbbApiKey] = useState('');
    const [savingImgbb, setSavingImgbb] = useState(false);

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
            if (data.imgbbApiKey) {
                setImgbbApiKey(data.imgbbApiKey);
            }
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

    const handleImgbbApiKeyChange = (value: string) => {
        setImgbbApiKey(value);
        setSavingImgbb(true);
        storage.set({ imgbbApiKey: value }).then(() => {
            setTimeout(() => setSavingImgbb(false), 500);
        });
    };

    const handleShortcutChange = (key: keyof Shortcuts, value: string) => {
        const newShortcuts = { ...shortcuts, [key]: value };
        setShortcuts(newShortcuts);
        // Auto save
        setSavingShortcuts(true);
        storage.set({ shortcuts: newShortcuts }).then(() => {
            setTimeout(() => setSavingShortcuts(false), 500);
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

            {/* Shortcuts Section */}
            {status === 'connected' && (
                <div className="space-y-4 pt-4 border-t border-gray-100">
                    <div className="flex items-center gap-2">
                        <Keyboard className="h-4 w-4 text-gray-500" />
                        <h3 className="text-sm font-medium text-gray-900">快捷键设置</h3>
                        {savingShortcuts && <span className="text-[10px] text-green-600 animate-pulse">已保存</span>}
                    </div>

                    <div className="space-y-1 bg-white rounded-lg border border-gray-100 p-3">
                        <div className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">插件内导航</div>
                        <ShortcutInput label="切换到速记" value={shortcuts.toggleMemo} shortcutKey="toggleMemo" />
                        <ShortcutInput label="切换到最近" value={shortcuts.toggleRecent} shortcutKey="toggleRecent" />
                        <ShortcutInput label="切换到剪藏" value={shortcuts.toggleClip} shortcutKey="toggleClip" />
                        <ShortcutInput label="切换到Prompt" value={shortcuts.togglePrompt} shortcutKey="togglePrompt" />

                        <div className="h-px bg-gray-50 my-2"></div>

                        <div className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">操作</div>
                        <ShortcutInput label="发送/保存 (速记/剪藏)" value={shortcuts.quickSend} shortcutKey="quickSend" />
                        <ShortcutInput label="全局选取剪藏 (网页中)" value={shortcuts.globalClip} shortcutKey="globalClip" />
                    </div>
                    <p className="text-[10px] text-gray-400">
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
                            onChange={(e) => handleImgbbApiKeyChange(e.target.value)}
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
