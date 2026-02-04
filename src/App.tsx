import React, { useState, useEffect } from 'react';
import { storage } from './utils/storage';
import Settings from './components/Settings';
import Memo from './components/Memo';
import Recent from './components/Recent';
import Clipper from './components/Clipper';
import Prompt from './components/Prompt';
import AIChat from './components/AIChat';
import { Settings as SettingsIcon, Notebook, History, Scissors, Sparkles, MessageSquare, ChevronLeft, PenTool } from 'lucide-react';

type Tab = 'memo' | 'recent' | 'clip' | 'prompt' | 'chat' | 'settings';

function App() {
    const [isAuth, setIsAuth] = useState<boolean | null>(null);
    const [activeTab, setActiveTab] = useState<Tab>('memo');
    const [previousTab, setPreviousTab] = useState<Tab>('memo');
    const [enabledModules, setEnabledModules] = useState<any>({ memo: true, recent: true, clip: true, prompt: true, chat: true });

    useEffect(() => {
        const checkJump = async () => {
            const data = await chrome.storage.local.get(['jumpToTab']);
            if (data.jumpToTab) {
                setActiveTab(data.jumpToTab as Tab);
                // 切换后清除标记，防止下次开启侧边栏时还是强行切换
                await chrome.storage.local.remove('jumpToTab');
            }
        };

        checkAuth();
        checkJump();

        const listener = (changes: any) => {
            if (changes.token || changes.enabledModules) {
                checkAuth();
            }
            if (changes.jumpToTab && changes.jumpToTab.newValue) {
                setActiveTab(changes.jumpToTab.newValue as Tab);
                chrome.storage.local.remove('jumpToTab');
            }
        };
        chrome.storage.onChanged.addListener(listener);
        return () => chrome.storage.onChanged.removeListener(listener);
    }, []);

    const checkAuth = async () => {
        const data = await storage.get();
        if (data.enabledModules) setEnabledModules(data.enabledModules);

        if (data.token) {
            setIsAuth(true);
            if (activeTab === 'settings' && !previousTab) {
                const mods = data.enabledModules || { memo: true, recent: true, clip: true, prompt: true, chat: true };
                if (mods.memo) setActiveTab('memo');
            }
        } else {
            setIsAuth(false);
            setActiveTab('settings');
        }
    };

    const handleTabChange = (tab: Tab) => {
        if (tab === 'settings' && activeTab !== 'settings') {
            setPreviousTab(activeTab);
        }
        setActiveTab(tab);
    };

    const handleBack = () => {
        if (previousTab && previousTab !== 'settings') {
            setActiveTab(previousTab);
        } else {
            setActiveTab('memo');
        }
    };

    if (isAuth === null) {
        return (
            <div className="flex h-screen items-center justify-center bg-gray-50/50">
                <div className="relative">
                    <div className="h-8 w-8 rounded-full border-2 border-teal-500/20 border-t-teal-500 animate-spin" />
                </div>
            </div>
        );
    }

    return (
        <div className="flex h-screen flex-col font-sans text-foreground overflow-hidden relative selection:bg-primary/20 selection:text-primary bg-background isolate">
            {/* 🍃 Zen Background Layer */}
            <div className="absolute inset-0 overflow-hidden pointer-events-none z-0">
                {/* Subtle Light Source (Top Right) */}
                <div className="absolute top-0 right-0 w-[100%] h-[80%] bg-gradient-to-bl from-primary/5 via-transparent to-transparent opacity-80" />

                {/* Ambient Warmth (Bottom Left) */}
                <div className="absolute bottom-0 left-0 w-[80%] h-[60%] bg-gradient-to-tr from-muted/50 via-background to-transparent" />

                {/* Paper Texture Noise - Opacity reduced in dark mode via CSS mix-blend-overlay if needed, or keep low */}
                <div className="absolute inset-0 opacity-[0.015] bg-repeat mix-blend-multiply dark:mix-blend-overlay" style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.8' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E")` }} />
            </div>

            {/* Header - Glass Effect */}
            <header className="glass absolute top-0 left-0 right-0 h-14 z-30 flex items-center justify-between px-5 transition-all">
                <div className="flex items-center gap-3">
                    {activeTab === 'settings' && isAuth ? (
                        <button
                            onClick={handleBack}
                            className="p-1.5 -ml-2 text-muted-foreground hover:text-primary hover:bg-primary/10 rounded-xl transition-all hover-lift"
                        >
                            <ChevronLeft className="h-5 w-5" />
                        </button>
                    ) : (
                        <div className="group relative">
                            <div className="absolute -inset-1 bg-gradient-to-r from-primary/50 to-emerald-400/50 rounded-xl blur opacity-25 group-hover:opacity-50 transition duration-200" />
                            <div className="relative w-8 h-8 bg-gradient-to-br from-primary to-teal-600 rounded-xl flex items-center justify-center shadow-lg shadow-primary/20 ring-1 ring-white/20">
                                <PenTool className="h-4 w-4 text-primary-foreground drop-shadow-sm" />
                            </div>
                        </div>
                    )}

                    <div className="flex flex-col">
                        {activeTab === 'settings' ? (
                            <span className="font-bold text-base text-foreground tracking-tight">设置</span>
                        ) : (
                            <span className="font-bold text-base bg-gradient-to-br from-foreground to-muted-foreground bg-clip-text text-transparent tracking-tight">
                                写拉松
                            </span>
                        )}
                    </div>
                </div>

                {isAuth && activeTab !== 'settings' && (
                    <button
                        onClick={() => handleTabChange('settings')}
                        className="rounded-full p-2 text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-all active:scale-95"
                    >
                        <SettingsIcon className="h-5 w-5" strokeWidth={1.5} />
                    </button>
                )}
            </header>

            {/* Main Content - Padded for Header/Nav */}
            <main className="flex-1 overflow-hidden relative flex flex-col pt-14 pb-[70px] z-10">
                <div key={activeTab} className="h-full w-full overflow-y-auto scrollbar-thin animate-enter px-1">
                    {activeTab === 'memo' && <Memo />}
                    {activeTab === 'recent' && <Recent />}
                    {activeTab === 'clip' && <Clipper />}
                    {activeTab === 'prompt' && <Prompt />}
                    {activeTab === 'chat' && <AIChat />}
                    {activeTab === 'settings' && <Settings />}
                </div>
            </main>

            {/* Navigation Bar - Floating Glass */}
            {isAuth && activeTab !== 'settings' && (
                <nav className="glass absolute bottom-0 left-0 right-0 h-[68px] flex items-center justify-around px-2 z-20 pb-safe">
                    <NavButton
                        active={activeTab === 'memo'}
                        onClick={() => handleTabChange('memo')}
                        icon={<Notebook size={22} strokeWidth={activeTab === 'memo' ? 2.5 : 1.5} />}
                        label="速记"
                        visible={enabledModules.memo}
                    />
                    <NavButton
                        active={activeTab === 'recent'}
                        onClick={() => handleTabChange('recent')}
                        icon={<History size={22} strokeWidth={activeTab === 'recent' ? 2.5 : 1.5} />}
                        label="最近"
                        visible={enabledModules.recent}
                    />
                    <NavButton
                        active={activeTab === 'clip'}
                        onClick={() => handleTabChange('clip')}
                        icon={<Scissors size={22} strokeWidth={activeTab === 'clip' ? 2.5 : 1.5} />}
                        label="剪藏"
                        visible={enabledModules.clip}
                    />
                    <NavButton
                        active={activeTab === 'prompt'}
                        onClick={() => handleTabChange('prompt')}
                        icon={<Sparkles size={22} strokeWidth={activeTab === 'prompt' ? 2.5 : 1.5} />}
                        label="灵感"
                        visible={enabledModules.prompt}
                    />
                    <NavButton
                        active={activeTab === 'chat'}
                        onClick={() => handleTabChange('chat')}
                        icon={<MessageSquare size={22} strokeWidth={activeTab === 'chat' ? 2.5 : 1.5} />}
                        label="助手"
                        visible={enabledModules.chat}
                    />
                </nav>
            )}
        </div>
    );
}

function NavButton({ active, onClick, icon, label, visible }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string; visible: boolean }) {
    if (!visible) return null;
    return (
        <button
            onClick={onClick}
            className={`
                relative flex flex-col items-center justify-center gap-1.5 w-full h-full 
                transition-all duration-300 group
                ${active ? 'text-primary' : 'text-muted-foreground hover:text-foreground'}
            `}
        >
            <div className={`
                relative z-10 p-1 rounded-xl transition-all duration-500 ease-out
                ${active ? 'bg-primary/10 -translate-y-1' : 'group-hover:bg-muted/50 group-hover:-translate-y-0.5'}
            `}>
                {icon}
            </div>

            <span className={`
                text-[10px] font-medium tracking-wide transition-all duration-300
                ${active ? 'opacity-100 translate-y-0 font-semibold' : 'opacity-0 translate-y-2 group-hover:opacity-70 group-hover:translate-y-0'}
            `}>
                {label}
            </span>

            {/* Active Glow Indicator */}
            {active && (
                <div className="absolute top-1 left-1/2 -translate-x-1/2 w-8 h-8 bg-primary/20 blur-xl rounded-full" />
            )}

            {/* Bottom active pill */}
            {active && (
                <div className="absolute bottom-1 w-1 h-1 bg-primary rounded-full shadow-[0_0_8px_hsl(var(--primary)/0.5)] animate-in fade-in zoom-in duration-300" />
            )}
        </button>
    );
}

export default App;
