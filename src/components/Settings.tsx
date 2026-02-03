import React, { useState, useEffect } from 'react';
import { WriteathonClient } from '../utils/api';
import { storage } from '../utils/storage';
import { Loader2, Save, LogOut, Key, Settings as SettingsIcon, User, Globe, Command, Eye, EyeOff, Check, AlertCircle, Bot } from 'lucide-react';

const Settings: React.FC = () => {
    const [token, setToken] = useState('');
    const [baseUrl, setBaseUrl] = useState('https://writeathon.cn');

    // AI Config
    const [aiProvider, setAiProvider] = useState<'gemini' | 'openai' | 'custom'>('gemini');
    const [aiApiKey, setAiApiKey] = useState('');
    const [aiBaseUrl, setAiBaseUrl] = useState('');
    const [aiModel, setAiModel] = useState('gemini-2.0-flash-exp');

    const [imgbbApiKey, setImgbbApiKey] = useState('');

    const [loading, setLoading] = useState(false);
    const [status, setStatus] = useState<string>('');
    const [statusMsg, setStatusMsg] = useState('');

    const [showToken, setShowToken] = useState(false);

    useEffect(() => {
        loadSettings();
    }, []);

    const loadSettings = async () => {
        const data = await storage.get();
        if (data.token) setToken(data.token);
        if (data.baseUrl) setBaseUrl(data.baseUrl);

        if (data.aiConfig) {
            setAiProvider(data.aiConfig.provider || 'gemini');
            setAiApiKey(data.aiConfig.apiKey || '');
            setAiBaseUrl(data.aiConfig.baseUrl || '');
            setAiModel(data.aiConfig.model || 'gemini-2.0-flash-exp');
        }

        if (data.imgbbApiKey) setImgbbApiKey(data.imgbbApiKey);
    };

    const handleSave = async () => {
        setLoading(true);
        setStatus('');
        setStatusMsg('');

        try {
            // 2. Save AI Config
            const aiConfig = {
                provider: aiProvider,
                apiKey: aiApiKey,
                baseUrl: aiBaseUrl,
                model: aiModel
            };

            await storage.set({
                token,
                baseUrl,
                aiConfig,
                imgbbApiKey
            });

            setStatus('success');
            setStatusMsg('设置已保存');
            setTimeout(() => setStatus(''), 3000);

        } catch (err: any) {
            setStatus('error');
            setStatusMsg(err.message || '保存失败');
        } finally {
            setLoading(false);
        }
    };

    const handleLogout = async () => {
        if (confirm('确定要退出登录吗？这将清除本地存储的 Token。')) {
            await storage.clear();
            setToken('');
            setAiApiKey('');
            setStatus('success');
            setStatusMsg('已退出登录');
            window.location.reload();
        }
    };

    return (
        <div className="flex flex-col h-full bg-gray-50/50">
            {/* Header */}
            <div className="px-6 py-5 border-b border-gray-100 bg-white sticky top-0 z-10 flex items-center justify-between">
                <div>
                    <h2 className="text-lg font-bold text-gray-800 flex items-center gap-2">
                        <SettingsIcon className="h-5 w-5 text-teal-600" />
                        设置
                    </h2>
                    <p className="text-xs text-gray-400 mt-1">配置账号与服务</p>
                </div>
                {token && (
                    <div className="flex items-center gap-2 bg-teal-50 px-3 py-1.5 rounded-full">
                        <div className="w-2 h-2 bg-teal-500 rounded-full animate-pulse" />
                        <span className="text-xs font-medium text-teal-700">Token 已设置</span>
                    </div>
                )}
            </div>

            <div className="flex-1 overflow-y-auto px-6 py-6 scrollbar-thin space-y-8">

                {/* 1. Account Section */}
                <section className="space-y-4">
                    <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider flex items-center gap-2">
                        <User className="h-3.5 w-3.5" /> 账号设定
                    </h3>
                    <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm space-y-4">
                        <div className="space-y-1.5">
                            <label className="text-sm font-medium text-gray-700">Writeathon Token</label>
                            <div className="relative">
                                <input
                                    type={showToken ? "text" : "password"}
                                    value={token}
                                    onChange={(e) => setToken(e.target.value)}
                                    placeholder="请输入你的 Access Token"
                                    className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 transition-all placeholder:text-gray-400"
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowToken(!showToken)}
                                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                                >
                                    {showToken ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                                </button>
                            </div>
                            <p className="text-[10px] text-gray-400">
                                在 <a href="https://writeathon.cn/profile/api" target="_blank" className="text-teal-600 hover:underline">Writeathon API设置</a> 中获取
                            </p>
                        </div>

                        <div className="space-y-1.5">
                            <label className="text-sm font-medium text-gray-700">服务器地址 (Base URL)</label>
                            <div className="relative">
                                <Globe className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                                <input
                                    type="text"
                                    value={baseUrl}
                                    onChange={(e) => setBaseUrl(e.target.value)}
                                    placeholder="默认: https://writeathon.cn"
                                    className="w-full bg-gray-50 border border-gray-200 rounded-xl pl-10 pr-4 py-2.5 text-sm focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 transition-all placeholder:text-gray-400"
                                />
                            </div>
                        </div>
                    </div>
                </section>

                {/* 2. AI Section */}
                <section className="space-y-4">
                    <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider flex items-center gap-2">
                        <Bot className="h-3.5 w-3.5" />
                        AI 模型配置
                    </h3>
                    <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm space-y-4">

                        <div className="grid grid-cols-3 gap-2 p-1 bg-gray-50 rounded-xl">
                            {['gemini', 'openai', 'custom'].map((p) => (
                                <button
                                    key={p}
                                    onClick={() => setAiProvider(p as any)}
                                    className={`py-2 text-xs font-bold rounded-lg transition-all capitalize ${aiProvider === p
                                            ? 'bg-white text-indigo-600 shadow-sm'
                                            : 'text-gray-400 hover:text-gray-600'
                                        }`}
                                >
                                    {p}
                                </button>
                            ))}
                        </div>

                        <div className="space-y-1.5">
                            <label className="text-sm font-medium text-gray-700">API Key</label>
                            <div className="relative">
                                <Key className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                                <input
                                    type="password"
                                    value={aiApiKey}
                                    onChange={(e) => setAiApiKey(e.target.value)}
                                    placeholder={`${aiProvider === 'gemini' ? 'Google AI' : 'OpenAI'} API Key`}
                                    className="w-full bg-gray-50 border border-gray-200 rounded-xl pl-10 pr-4 py-2.5 text-sm focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all placeholder:text-gray-400"
                                />
                            </div>
                        </div>

                        {aiProvider !== 'gemini' && (
                            <div className="space-y-1.5 animate-in fade-in slide-in-from-top-1">
                                <label className="text-sm font-medium text-gray-700">API Link / Base URL</label>
                                <input
                                    type="text"
                                    value={aiBaseUrl}
                                    onChange={(e) => setAiBaseUrl(e.target.value)}
                                    placeholder={aiProvider === 'openai' ? "https://api.openai.com/v1" : "Custom API URL"}
                                    className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all placeholder:text-gray-400 font-mono"
                                />
                            </div>
                        )}

                        <div className="space-y-1.5">
                            <label className="text-sm font-medium text-gray-700">模型名称</label>
                            {aiProvider === 'gemini' ? (
                                <div className="relative">
                                    <select
                                        value={aiModel}
                                        onChange={(e) => setAiModel(e.target.value)}
                                        className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all text-gray-700 appearance-none cursor-pointer"
                                    >
                                        <option value="gemini-2.0-flash-exp">Gemini 2.0 Flash (Recommended)</option>
                                        <option value="gemini-1.5-pro">Gemini 1.5 Pro</option>
                                        <option value="gemini-1.5-flash">Gemini 1.5 Flash</option>
                                    </select>
                                    <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
                                </div>
                            ) : (
                                <input
                                    type="text"
                                    value={aiModel}
                                    onChange={(e) => setAiModel(e.target.value)}
                                    placeholder="gpt-4o, claude-3-5-sonnet..."
                                    className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all placeholder:text-gray-400"
                                />
                            )}
                        </div>
                    </div>
                </section>

                {/* 3. Image Hosting (ImgBB) */}
                <section className="space-y-4">
                    <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider flex items-center gap-2">
                        <SettingsIcon className="h-3.5 w-3.5" /> 图片服务
                    </h3>
                    <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm space-y-4">
                        <div className="space-y-1.5">
                            <label className="text-sm font-medium text-gray-700 flex justify-between">
                                ImgBB API Key
                                <a href="https://api.imgbb.com/" target="_blank" className="text-xs text-teal-600 hover:underline font-normal">获取 Key</a>
                            </label>
                            <input
                                type="password"
                                value={imgbbApiKey}
                                onChange={(e) => setImgbbApiKey(e.target.value)}
                                placeholder="用于绕过图片防盗链 (可选)"
                                className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 transition-all placeholder:text-gray-400"
                            />
                            <p className="text-[10px] text-gray-400">如果不填，将使用默认 Key（可能会有额度限制）</p>
                        </div>
                    </div>
                </section>

                {/* 4. Shortcuts Hint */}
                <section className="space-y-4 pb-12">
                    <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider flex items-center gap-2">
                        <Command className="h-3.5 w-3.5" /> 快捷键
                    </h3>
                    <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm">
                        <div className="flex justify-between items-center text-sm text-gray-600">
                            <span>快速发送 Memo</span>
                            <kbd className="px-2 py-1 bg-gray-100 border border-gray-200 rounded-lg font-mono text-xs font-bold text-gray-500">Ctrl + Enter</kbd>
                        </div>
                    </div>
                </section>
            </div>

            {/* Footer Actions */}
            <div className="px-6 py-4 bg-white border-t border-gray-50 flex items-center justify-between z-20">
                {token && (
                    <button
                        onClick={handleLogout}
                        className="flex items-center gap-2 text-gray-400 hover:text-red-500 transition-colors text-sm font-medium px-2 py-1"
                    >
                        <LogOut className="h-4 w-4" />
                        <span>退出</span>
                    </button>
                )}

                <div className="flex items-center gap-4 ml-auto">
                    {status && (
                        <span className={`text-xs font-bold animate-in fade-in flex items-center gap-1.5 ${status === 'success' ? 'text-green-600' : 'text-red-500'}`}>
                            {status === 'success' ? <Check className="h-3 w-3" /> : <AlertCircle className="h-3 w-3" />}
                            {statusMsg}
                        </span>
                    )}

                    <button
                        onClick={handleSave}
                        disabled={loading}
                        className="flex items-center gap-2 bg-teal-600 hover:bg-teal-700 text-white px-8 py-2.5 rounded-full font-bold text-sm shadow-md shadow-teal-200 hover:shadow-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                        <span>保存设置</span>
                    </button>
                </div>
            </div>
        </div>
    );
};

// Helper for icon
const ChevronDown = ({ className }: { className?: string }) => (
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><path d="m6 9 6 6 6-6" /></svg>
);

export default Settings;
