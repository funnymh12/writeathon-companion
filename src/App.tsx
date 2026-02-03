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
        checkAuth();

        // Listen for storage changes (e.g. login/logout)
        const listener = (changes: any) => {
            if (changes.token) {
                checkAuth();
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
            // If we were in settings (e.g. initial load), go to default
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
            <div className="flex h-screen items-center justify-center bg-white">
                <Loader2 className="h-6 w-6 animate-spin text-teal-500" />
            </div>
        );
    }

    return (
        <div className="flex h-screen flex-col bg-gray-50 font-sans text-gray-900 overflow-hidden">
            {/* Header */}
            <header className="flex h-14 items-center justify-between px-5 shrink-0 bg-white/80 backdrop-blur-md z-30 transition-all border-b border-gray-100 relative">
                <div className="flex items-center gap-3">
                    {activeTab === 'settings' && isAuth ? (
                        <button
                            onClick={handleBack}
                            className="p-1.5 -ml-2 text-gray-500 hover:text-teal-600 hover:bg-teal-50 rounded-lg transition-all"
                        >
                            <ChevronLeft className="h-6 w-6" />
                        </button>
                    ) : (
                        <div className="w-8 h-8 bg-gradient-to-br from-teal-400 to-teal-600 rounded-xl flex items-center justify-center shadow-sm shadow-teal-200 ring-1 ring-white">
                            <PenTool className="h-4 w-4 text-white" />
                        </div>
                    )}

                    {activeTab === 'settings' ? (
                        <span className="font-bold text-base text-gray-800">设置</span>
                    ) : (
                        <span className="font-bold text-base text-gray-800 tracking-tight">写拉松</span>
                    )}
                </div>

                {isAuth && activeTab !== 'settings' && (
                    <button
                        onClick={() => handleTabChange('settings')}
                        className="rounded-full p-2 text-gray-400 hover:text-teal-600 hover:bg-teal-50 transition-all"
                    >
                        <SettingsIcon className="h-5 w-5" />
                    </button>
                )}
            </header>

            {/* Main Content */}
            <main className="flex-1 overflow-hidden relative flex flex-col bg-white">
                {activeTab === 'memo' && <Memo />}
                {activeTab === 'recent' && <Recent />}
                {activeTab === 'clip' && <Clipper />}
                {activeTab === 'prompt' && <Prompt />}
                {activeTab === 'chat' && <AIChat />}
                {activeTab === 'settings' && <Settings />}
            </main>

            {/* Navigation Bar */}
            {isAuth && activeTab !== 'settings' && (
                <nav className="flex h-[68px] bg-white items-center justify-around px-2 shrink-0 border-t border-gray-100 shadow-[0_-4px_20px_-8px_rgba(0,0,0,0.05)] z-30 pb-safe">
                    <NavButton
                        active={activeTab === 'memo'}
                        onClick={() => handleTabChange('memo')}
                        icon={<Notebook size={24} strokeWidth={activeTab === 'memo' ? 2.5 : 2} />}
                        label="速记"
                        visible={enabledModules.memo}
                    />
                    <NavButton
                        active={activeTab === 'recent'}
                        onClick={() => handleTabChange('recent')}
                        icon={<History size={24} strokeWidth={activeTab === 'recent' ? 2.5 : 2} />}
                        label="最近"
                        visible={enabledModules.recent}
                    />
                    <NavButton
                        active={activeTab === 'clip'}
                        onClick={() => handleTabChange('clip')}
                        icon={<Scissors size={24} strokeWidth={activeTab === 'clip' ? 2.5 : 2} />}
                        label="剪藏"
                        visible={enabledModules.clip}
                    />
                    <NavButton
                        active={activeTab === 'prompt'}
                        onClick={() => handleTabChange('prompt')}
                        icon={<Sparkles size={24} strokeWidth={activeTab === 'prompt' ? 2.5 : 2} />}
                        label="灵感"
                        visible={enabledModules.prompt}
                    />
                    <NavButton
                        active={activeTab === 'chat'}
                        onClick={() => handleTabChange('chat')}
                        icon={<MessageSquare size={24} strokeWidth={activeTab === 'chat' ? 2.5 : 2} />}
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
            className={`relative flex flex-col items-center justify-center gap-1 w-full h-full transition-all duration-300 group ${active ? 'text-teal-600' : 'text-gray-400 hover:text-gray-500'}`}
        >
            <div className={`transition-all duration-300 ${active ? '-translate-y-1 scale-110' : 'group-hover:-translate-y-0.5'}`}>
                {icon}
            </div>
            <span className={`text-[10px] font-medium transition-all duration-300 ${active ? 'opacity-100 font-bold' : 'opacity-70 group-hover:opacity-100'}`}>
                {label}
            </span>
            {active && (
                <div className="absolute bottom-1.5 w-1 h-1 bg-teal-500 rounded-full animate-in fade-in zoom-in duration-300" />
            )}
        </button>
    );
}

function Loader2({ className }: { className?: string }) {
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
            <path d="M21 12a9 9 0 1 1-6.219-8.56" />
        </svg>
    );
}

export default App;
