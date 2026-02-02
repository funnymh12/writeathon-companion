import React, { useState, useEffect } from 'react';
import { storage } from '../utils/storage';
import { WriteathonClient } from '../utils/api';
import { Loader2, CheckCircle, XCircle, ArrowLeft } from 'lucide-react';

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
    };

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
                        className="w-full flex items-center justify-center px-4 py-2 bg-black text-white rounded-md shadow-sm text-sm font-medium hover:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary disabled:opacity-50"
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

            <div className="mt-8 pt-6 border-t border-gray-100 text-xs text-gray-400">
                你可以在写拉松「设置 → 集成」中生成 Token
            </div>
        </div>
    );
};

export default Settings;
