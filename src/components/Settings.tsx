import React, { useState, useEffect } from 'react';
import { WriteathonClient } from '../utils/api';
import { storage } from '../utils/storage';
import { Loader2, Save, LogOut, Key, Settings as SettingsIcon, User, Globe, Command, Eye, EyeOff, Check, AlertCircle, Bot, Notebook, History, Scissors, Sparkles, MessageSquare } from 'lucide-react';

const Settings: React.FC = () => {
    const [token, setToken] = useState('');
    const [baseUrl, setBaseUrl] = useState('https://writeathon.cn');

    // AI Config
    const [aiProvider, setAiProvider] = useState<'gemini' | 'openai' | 'custom'>('gemini');
    const [aiApiKey, setAiApiKey] = useState('');
    const [aiBaseUrl, setAiBaseUrl] = useState('');
    const [aiModel, setAiModel] = useState('gemini-2.0-flash-exp');

    // Image Config
    const [imageProvider, setImageProvider] = useState<'imgbb' | 'qiniu'>('imgbb');
    const [imgbbApiKey, setImgbbApiKey] = useState('');
    const [qiniuAk, setQiniuAk] = useState('');
    const [qiniuSk, setQiniuSk] = useState('');
    const [qiniuBucket, setQiniuBucket] = useState('');
    const [qiniuDomain, setQiniuDomain] = useState('');
    const [qiniuRegion, setQiniuRegion] = useState('z0');

    // Shortcuts
    const [globalClipShortcut, setGlobalClipShortcut] = useState('Alt+S');
    const [openMemoShortcut, setOpenMemoShortcut] = useState('Alt+M');
    const [quickSendShortcut, setQuickSendShortcut] = useState('Ctrl+Enter');

    // Module Visibility
    const [enabledModules, setEnabledModules] = useState({
        memo: true,
        recent: true,
        clip: true,
        prompt: true,
        chat: true
    });

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

        if (data.imageConfig) {
            setImageProvider(data.imageConfig.provider || 'imgbb');
            if (data.imageConfig.imgbb) {
                setImgbbApiKey(data.imageConfig.imgbb.apiKey || '');
            }
            if (data.imageConfig.qiniu) {
                setQiniuAk(data.imageConfig.qiniu.accessKey || '');
                setQiniuSk(data.imageConfig.qiniu.secretKey || '');
                setQiniuBucket(data.imageConfig.qiniu.bucket || '');
                setQiniuDomain(data.imageConfig.qiniu.domain || '');
                setQiniuRegion(data.imageConfig.qiniu.region || 'z0');
            }
        } else if (data.imgbbApiKey) {
            // Migration
            setImageProvider('imgbb');
            setImgbbApiKey(data.imgbbApiKey);
        }

        if (data.shortcuts) {
            if (data.shortcuts.globalClip) setGlobalClipShortcut(data.shortcuts.globalClip);
            if (data.shortcuts.openMemo) setOpenMemoShortcut(data.shortcuts.openMemo);
            if (data.shortcuts.quickSend) setQuickSendShortcut(data.shortcuts.quickSend);
        }

        if (data.enabledModules) {
            setEnabledModules({ ...enabledModules, ...data.enabledModules });
        }
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

            // 3. Save Image Config
            const imageConfig = {
                provider: imageProvider,
                imgbb: { apiKey: imgbbApiKey },
                qiniu: {
                    accessKey: qiniuAk,
                    secretKey: qiniuSk,
                    bucket: qiniuBucket,
                    domain: qiniuDomain,
                    region: qiniuRegion
                }
            };

            await storage.set({
                token,
                baseUrl,
                aiConfig,
                imageConfig,
                imgbbApiKey, // Keep strictly for rollback/compatibility if needed, but primary is imageConfig
                shortcuts: {
                    globalClip: globalClipShortcut,
                    openMemo: openMemoShortcut,
                    quickSend: quickSendShortcut
                },
                enabledModules
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
        <div className="flex flex-col h-full bg-background">
            {/* Header */}
            <div className="px-6 py-5 border-b border-border/50 bg-card sticky top-0 z-10 flex items-center justify-between">
                <div>
                    <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
                        <SettingsIcon className="h-5 w-5 text-primary" />
                        设置
                    </h2>
                    <p className="text-xs text-muted-foreground mt-1">配置账号与服务</p>
                </div>
                {token && (
                    <div className="flex items-center gap-2 bg-primary/10 px-3 py-1.5 rounded-full">
                        <div className="w-2 h-2 bg-primary rounded-full animate-pulse" />
                        <span className="text-xs font-medium text-primary">Token 已设置</span>
                    </div>
                )}
            </div>

            <div className="flex-1 overflow-y-auto px-6 py-6 scrollbar-thin space-y-8">

                {/* 1. Account Section */}
                <section className="space-y-4">
                    <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
                        <User className="h-3.5 w-3.5" /> 账号设定
                    </h3>
                    <div className="bg-card p-5 rounded-2xl border border-border/50 shadow-sm space-y-4">
                        <div className="space-y-1.5">
                            <label className="text-sm font-medium text-foreground">Writeathon Token</label>
                            <div className="relative">
                                <input
                                    type={showToken ? "text" : "password"}
                                    value={token}
                                    onChange={(e) => setToken(e.target.value)}
                                    placeholder="请输入你的 Access Token"
                                    className="w-full bg-muted/50 border border-border rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all placeholder:text-muted-foreground/50"
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowToken(!showToken)}
                                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                                >
                                    {showToken ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                                </button>
                            </div>
                            <p className="text-[10px] text-muted-foreground">
                                在 <a href="https://writeathon.cn/profile/api" target="_blank" className="text-primary hover:underline">Writeathon API设置</a> 中获取
                            </p>
                        </div>

                        <div className="space-y-1.5">
                            <label className="text-sm font-medium text-foreground">服务器地址 (Base URL)</label>
                            <div className="relative">
                                <Globe className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                                <input
                                    type="text"
                                    value={baseUrl}
                                    onChange={(e) => setBaseUrl(e.target.value)}
                                    placeholder="默认: https://writeathon.cn"
                                    className="w-full bg-muted/50 border border-border rounded-xl pl-10 pr-4 py-2.5 text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all placeholder:text-muted-foreground/50"
                                />
                            </div>
                        </div>
                    </div>
                </section>

                {/* 2. AI Section */}
                <section className="space-y-4">
                    <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
                        <Bot className="h-3.5 w-3.5" />
                        AI 模型配置
                    </h3>
                    <div className="bg-card p-5 rounded-2xl border border-border/50 shadow-sm space-y-4">

                        <div className="grid grid-cols-3 gap-2 p-1 bg-muted/50 rounded-xl">
                            {['gemini', 'openai', 'custom'].map((p) => (
                                <button
                                    key={p}
                                    onClick={() => setAiProvider(p as any)}
                                    className={`py-2 text-xs font-bold rounded-lg transition-all capitalize ${aiProvider === p
                                        ? 'bg-card text-primary shadow-sm'
                                        : 'text-muted-foreground hover:text-foreground'
                                        }`}
                                >
                                    {p}
                                </button>
                            ))}
                        </div>

                        <div className="space-y-1.5">
                            <label className="text-sm font-medium text-foreground">API Key</label>
                            <div className="relative">
                                <Key className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                                <input
                                    type="password"
                                    value={aiApiKey}
                                    onChange={(e) => setAiApiKey(e.target.value)}
                                    placeholder={`${aiProvider === 'gemini' ? 'Google AI' : 'OpenAI'} API Key`}
                                    className="w-full bg-muted/50 border border-border rounded-xl pl-10 pr-4 py-2.5 text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all placeholder:text-muted-foreground/50"
                                />
                            </div>
                        </div>

                        {aiProvider !== 'gemini' && (
                            <div className="space-y-1.5 animate-in fade-in slide-in-from-top-1">
                                <label className="text-sm font-medium text-foreground">API Link / Base URL</label>
                                <input
                                    type="text"
                                    value={aiBaseUrl}
                                    onChange={(e) => setAiBaseUrl(e.target.value)}
                                    placeholder={aiProvider === 'openai' ? "https://api.openai.com/v1" : "Custom API URL"}
                                    className="w-full bg-muted/50 border border-border rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all placeholder:text-muted-foreground/50 font-mono"
                                />
                            </div>
                        )}

                        <div className="space-y-1.5">
                            <label className="text-sm font-medium text-foreground">模型名称</label>
                            {aiProvider === 'gemini' ? (
                                <div className="relative">
                                    <select
                                        value={aiModel}
                                        onChange={(e) => setAiModel(e.target.value)}
                                        className="w-full bg-muted/50 border border-border rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all text-foreground appearance-none cursor-pointer"
                                    >
                                        <option value="gemini-2.0-flash-exp">Gemini 2.0 Flash (Recommended)</option>
                                        <option value="gemini-1.5-pro">Gemini 1.5 Pro</option>
                                        <option value="gemini-1.5-flash">Gemini 1.5 Flash</option>
                                    </select>
                                    <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                                </div>
                            ) : (
                                <input
                                    type="text"
                                    value={aiModel}
                                    onChange={(e) => setAiModel(e.target.value)}
                                    placeholder="gpt-4o, claude-3-5-sonnet..."
                                    className="w-full bg-muted/50 border border-border rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all placeholder:text-muted-foreground/50"
                                />
                            )}
                        </div>
                    </div>
                </section>

                {/* 3. Image Hosting */}
                <section className="space-y-4">
                    <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
                        <User className="h-3.5 w-3.5" /> 图片服务
                    </h3>
                    <div className="bg-card p-5 rounded-2xl border border-border/50 shadow-sm space-y-4">
                        <div className="grid grid-cols-2 gap-2 p-1 bg-muted/50 rounded-xl mb-4">
                            {(['imgbb', 'qiniu'] as const).map((p) => (
                                <button
                                    key={p}
                                    onClick={() => setImageProvider(p)}
                                    className={`py-2 text-xs font-bold rounded-lg transition-all capitalize ${imageProvider === p
                                        ? 'bg-card text-primary shadow-sm'
                                        : 'text-muted-foreground hover:text-foreground'
                                        }`}
                                >
                                    {p === 'imgbb' ? 'ImgBB' : '七牛云'}
                                </button>
                            ))}
                        </div>

                        {imageProvider === 'imgbb' ? (
                            <div className="space-y-1.5 animate-in fade-in slide-in-from-top-1">
                                <label className="text-sm font-medium text-foreground flex justify-between">
                                    ImgBB API Key
                                    <a href="https://api.imgbb.com/" target="_blank" className="text-xs text-primary hover:underline font-normal">获取 Key</a>
                                </label>
                                <input
                                    type="password"
                                    value={imgbbApiKey}
                                    onChange={(e) => setImgbbApiKey(e.target.value)}
                                    placeholder="用于绕过图片防盗链 (可选)"
                                    className="w-full bg-muted/50 border border-border rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all placeholder:text-muted-foreground/50"
                                />
                                <p className="text-[10px] text-muted-foreground">如果不填，将使用默认 Key（可能会有额度限制）</p>
                            </div>
                        ) : (
                            <div className="space-y-3 animate-in fade-in slide-in-from-top-1">
                                <div className="space-y-1.5">
                                    <label className="text-sm font-medium text-foreground">Access Key (AK)</label>
                                    <input
                                        type="password"
                                        value={qiniuAk}
                                        onChange={(e) => setQiniuAk(e.target.value)}
                                        className="w-full bg-muted/50 border border-border rounded-xl px-4 py-2 text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
                                    />
                                </div>
                                <div className="space-y-1.5">
                                    <label className="text-sm font-medium text-foreground">Secret Key (SK)</label>
                                    <input
                                        type="password"
                                        value={qiniuSk}
                                        onChange={(e) => setQiniuSk(e.target.value)}
                                        className="w-full bg-muted/50 border border-border rounded-xl px-4 py-2 text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
                                    />
                                </div>
                                <div className="grid grid-cols-2 gap-3">
                                    <div className="space-y-1.5">
                                        <label className="text-sm font-medium text-foreground">Bucket Name</label>
                                        <input
                                            type="text"
                                            value={qiniuBucket}
                                            onChange={(e) => setQiniuBucket(e.target.value)}
                                            className="w-full bg-muted/50 border border-border rounded-xl px-4 py-2 text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
                                        />
                                    </div>
                                    <div className="space-y-1.5">
                                        <label className="text-sm font-medium text-foreground">Region</label>
                                        <div className="relative">
                                            <select
                                                value={qiniuRegion}
                                                onChange={(e) => setQiniuRegion(e.target.value)}
                                                className="w-full bg-muted/50 border border-border rounded-xl px-4 py-2 text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all text-foreground appearance-none cursor-pointer"
                                            >
                                                <option value="z0">华东 (z0)</option>
                                                <option value="z1">华北 (z1)</option>
                                                <option value="z2">华南 (z2)</option>
                                                <option value="na0">北美 (na0)</option>
                                                <option value="as0">东南亚 (as0)</option>
                                            </select>
                                            <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                                        </div>
                                    </div>
                                </div>
                                <div className="space-y-1.5">
                                    <label className="text-sm font-medium text-foreground">Domain (CDN 域名)</label>
                                    <input
                                        type="text"
                                        value={qiniuDomain}
                                        onChange={(e) => setQiniuDomain(e.target.value)}
                                        placeholder="e.g. https://img.example.com"
                                        className="w-full bg-muted/50 border border-border rounded-xl px-4 py-2 text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all placeholder:text-muted-foreground/50"
                                    />
                                </div>
                            </div>
                        )}
                    </div>
                </section>

                {/* 4. Module Management */}
                <section className="space-y-4">
                    <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
                        <Command className="h-3.5 w-3.5" /> 功能开关
                    </h3>
                    <div className="bg-card p-5 rounded-2xl border border-border/50 shadow-sm space-y-2">
                        <ModuleToggle
                            icon={<Notebook className="h-4 w-4" />}
                            label="速记"
                            description="随时随地记录灵感"
                            enabled={enabledModules.memo}
                            onChange={(val) => setEnabledModules({ ...enabledModules, memo: val })}
                        />
                        <ModuleToggle
                            icon={<History className="h-4 w-4" />}
                            label="最近"
                            description="查看并管理历史卡片"
                            enabled={enabledModules.recent}
                            onChange={(val) => setEnabledModules({ ...enabledModules, recent: val })}
                        />
                        <ModuleToggle
                            icon={<Scissors className="h-4 w-4" />}
                            label="剪藏"
                            description="整页或图片网页收藏"
                            enabled={enabledModules.clip}
                            onChange={(val) => setEnabledModules({ ...enabledModules, clip: val })}
                        />
                        <ModuleToggle
                            icon={<Sparkles className="h-4 w-4" />}
                            label="灵感"
                            description="AI 辅助写作与提示词"
                            enabled={enabledModules.prompt}
                            onChange={(val) => setEnabledModules({ ...enabledModules, prompt: val })}
                        />
                        <ModuleToggle
                            icon={<MessageSquare className="h-4 w-4" />}
                            label="助手"
                            description="深度 AI 对话问答"
                            enabled={enabledModules.chat}
                            onChange={(val) => setEnabledModules({ ...enabledModules, chat: val })}
                        />
                    </div>
                </section>

                {/* 4. Shortcuts Hint */}
                <section className="space-y-4 pb-12">
                    <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
                        <Command className="h-3.5 w-3.5" /> 快捷键
                    </h3>
                    <div className="bg-card p-5 rounded-2xl border border-border/50 shadow-sm space-y-4">
                        <div className="space-y-1.5">
                            <label className="text-sm font-medium text-foreground">发送选中文本 (全局)</label>
                            <input
                                type="text"
                                value={globalClipShortcut}
                                onChange={(e) => setGlobalClipShortcut(e.target.value)}
                                placeholder="例如: Alt+S"
                                className="w-full bg-muted/50 border border-border rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all font-mono"
                                onKeyDown={(e) => {
                                    e.preventDefault();
                                    const shortcut = getShortcutString(e);
                                    if (shortcut) setGlobalClipShortcut(shortcut);
                                }}
                            />
                        </div>
                        <div className="space-y-1.5">
                            <label className="text-sm font-medium text-foreground">唤起速记模块 (全局)</label>
                            <input
                                type="text"
                                value={openMemoShortcut}
                                onChange={(e) => setOpenMemoShortcut(e.target.value)}
                                placeholder="例如: Alt+M"
                                className="w-full bg-muted/50 border border-border rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all font-mono"
                                onKeyDown={(e) => {
                                    e.preventDefault();
                                    const shortcut = getShortcutString(e);
                                    if (shortcut) setOpenMemoShortcut(shortcut);
                                }}
                            />
                        </div>
                        <div className="space-y-1.5">
                            <label className="text-sm font-medium text-foreground">快速发送 Memo (应用内)</label>
                            <input
                                type="text"
                                value={quickSendShortcut}
                                onChange={(e) => setQuickSendShortcut(e.target.value)}
                                placeholder="例如: Ctrl+Enter"
                                className="w-full bg-muted/50 border border-border rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all font-mono"
                                onKeyDown={(e) => {
                                    e.preventDefault();
                                    const shortcut = getShortcutString(e);
                                    if (shortcut) setQuickSendShortcut(shortcut);
                                }}
                            />
                        </div>
                    </div>
                </section>
            </div>

            {/* Footer Actions */}
            <div className="px-6 py-4 bg-card border-t border-border/50 flex items-center justify-between z-20">
                {token && (
                    <button
                        onClick={handleLogout}
                        className="flex items-center gap-2 text-muted-foreground hover:text-destructive transition-colors text-sm font-medium px-2 py-1"
                    >
                        <LogOut className="h-4 w-4" />
                        <span>退出</span>
                    </button>
                )}

                <div className="flex items-center gap-4 ml-auto">
                    {status && (
                        <span className={`text-xs font-bold animate-in fade-in flex items-center gap-1.5 ${status === 'success' ? 'text-green-600 dark:text-green-400' : 'text-destructive'}`}>
                            {status === 'success' ? <Check className="h-3 w-3" /> : <AlertCircle className="h-3 w-3" />}
                            {statusMsg}
                        </span>
                    )}

                    <button
                        onClick={handleSave}
                        disabled={loading}
                        className="flex items-center gap-2 bg-primary hover:bg-primary/90 text-primary-foreground px-8 py-2.5 rounded-full font-bold text-sm shadow-md shadow-primary/30 hover:shadow-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                        <span>保存设置</span>
                    </button>
                </div>
            </div>
        </div>
    );
};

// Helper to capture shortcut string
const getShortcutString = (event: React.KeyboardEvent | KeyboardEvent) => {
    const parts = [];
    if (event.ctrlKey) parts.push('Ctrl');
    if (event.altKey) parts.push('Alt');
    if (event.shiftKey) parts.push('Shift');
    if (event.metaKey) parts.push('Meta');

    // Ignore modifier overrides
    if (['Control', 'Alt', 'Shift', 'Meta'].includes(event.key)) {
        return null;
    }

    let key = event.key;
    if (key === ' ') key = 'Space';
    if (key.toLowerCase() === 'enter') key = 'Enter';

    // Convert single chars to uppercase
    if (key.length === 1) key = key.toUpperCase();

    parts.push(key);
    return parts.join('+');
}

// Helper for module toggle
const ModuleToggle = ({ icon, label, description, enabled, onChange }: { icon: React.ReactNode, label: string, description: string, enabled: boolean, onChange: (val: boolean) => void }) => (
    <div className="flex items-center justify-between py-3 group">
        <div className="flex items-center gap-3">
            <div className={`p-2 rounded-xl transition-colors ${enabled ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'}`}>
                {icon}
            </div>
            <div>
                <p className={`text-sm font-bold ${enabled ? 'text-foreground' : 'text-muted-foreground'}`}>{label}</p>
                <p className="text-[10px] text-muted-foreground">{description}</p>
            </div>
        </div>
        <button
            onClick={() => onChange(!enabled)}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ring-2 ring-transparent focus:ring-primary/10 ${enabled ? 'bg-primary' : 'bg-muted-foreground/30'}`}
        >
            <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${enabled ? 'translate-x-6' : 'translate-x-1'}`} />
        </button>
    </div>
);

// Helper for icon
const ChevronDown = ({ className }: { className?: string }) => (
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><path d="m6 9 6 6 6-6" /></svg>
);

export default Settings;
