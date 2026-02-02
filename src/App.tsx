import { useState, useEffect } from 'react';
import { storage } from './utils/storage';
import Settings from './components/Settings';
import Memo from './components/Memo';
import Recent from './components/Recent';
import Clipper from './components/Clipper';
import Prompt from './components/Prompt';
import AIChat from './components/AIChat';
import { Settings as SettingsIcon, Notebook, History, Scissors, Sparkles, MessageSquare } from 'lucide-react';

type Tab = 'memo' | 'recent' | 'clip' | 'prompt' | 'chat' | 'settings';

function App() {
    const [isAuth, setIsAuth] = useState<boolean | null>(null);
    const [activeTab, setActiveTab] = useState<Tab>('memo');
    const [previousTab, setPreviousTab] = useState<Tab>('memo');

    useEffect(() => {
        checkAuth();

        const handleKeyDown = async (e: KeyboardEvent) => {
            const target = e.target as HTMLElement;
            if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) return;

            const data = await storage.get();
            const shortcuts = data.shortcuts || {
                toggleMemo: 'Alt+1',
                toggleRecent: 'Alt+2',
                toggleClip: 'Alt+3',
                togglePrompt: 'Alt+4',
                toggleChat: 'Alt+5',
                quickSend: 'Ctrl+Enter',
                globalClip: 'Alt+Shift+S'
            };

            const getKeyString = (ev: KeyboardEvent) => {
                const parts = [];
                if (ev.ctrlKey) parts.push('Ctrl');
                if (ev.altKey) parts.push('Alt');
                if (ev.shiftKey) parts.push('Shift');
                if (ev.metaKey) parts.push('Meta');

                let key = ev.key.toUpperCase();
                if (['CONTROL', 'ALT', 'SHIFT', 'META'].includes(key)) return null;
                if (key === ' ') key = 'Space';
                if (key === 'ENTER') key = 'Enter';

                parts.push(key);
                return parts.join('+');
            };

            const pressed = getKeyString(e);
            if (!pressed) return;

            if (pressed === shortcuts.toggleMemo) {
                setActiveTab('memo');
            } else if (pressed === shortcuts.toggleRecent) {
                setActiveTab('recent');
            } else if (pressed === shortcuts.toggleClip) {
                setActiveTab('clip');
            } else if (pressed === shortcuts.togglePrompt) {
                setActiveTab('prompt');
            } else if (pressed === shortcuts.toggleChat) {
                setActiveTab('chat');
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, []);

    const checkAuth = async () => {
        const data = await storage.get();
        if (data.token && data.userId) {
            setIsAuth(true);
            setActiveTab('memo');
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

    const handleSettingsBack = () => {
        setActiveTab(previousTab);
    };

    const renderContent = () => {
        switch (activeTab) {
            case 'memo': return <Memo />;
            case 'recent': return <Recent />;
            case 'clip': return <Clipper />;
            case 'prompt': return <Prompt />;
            case 'chat': return <AIChat />;
            case 'settings':
                return (
                    <Settings
                        onSuccess={() => { setIsAuth(true); setActiveTab('memo'); }}
                        onBack={handleSettingsBack}
                        isAuthenticated={isAuth === true}
                    />
                );
            default: return <Memo />;
        }
    };

    if (isAuth === null) {
        return (
            <div className="flex h-screen items-center justify-center bg-white">
                <div className="flex items-center gap-2 text-teal-500">
                    <div className="h-5 w-5 animate-spin rounded-full border-2 border-teal-500 border-t-transparent"></div>
                    <span className="text-gray-600 font-medium">加载中...</span>
                </div>
            </div>
        );
    }

    return (
        <div className="flex h-screen flex-col bg-white overflow-hidden">
            <header className="flex h-14 items-center justify-between border-b px-4 shrink-0 bg-white z-10">
                <div className="flex items-center gap-2">
                    <div className="w-8 h-8 bg-gradient-to-br from-teal-400 to-teal-600 rounded-full flex items-center justify-center shadow-sm">
                        <span className="text-white font-bold text-sm">写</span>
                    </div>
                    <span className="font-bold text-base text-gray-800 tracking-tight">写拉松小助手</span>
                </div>
                {isAuth && (
                    <button
                        onClick={() => handleTabChange('settings')}
                        className={`rounded-full p-2 transition-all ${activeTab === 'settings' ? 'text-teal-500 bg-teal-50' : 'text-gray-400 hover:text-teal-500 hover:bg-teal-50/50'}`}
                    >
                        <SettingsIcon className="h-5 w-5" />
                    </button>
                )}
            </header>

            <main className="flex-1 overflow-y-auto bg-gray-50/50 relative">
                {renderContent()}
            </main>

            {isAuth && (activeTab !== 'settings') && (
                <nav className="flex h-16 border-t bg-white items-center justify-around px-1 shrink-0">
                    <button
                        onClick={() => setActiveTab('memo')}
                        className={`flex flex-col items-center gap-1 transition-all py-1.5 flex-1 ${activeTab === 'memo' ? 'text-teal-600' : 'text-gray-400 hover:text-gray-600'}`}
                    >
                        <Notebook size={20} className={activeTab === 'memo' ? 'scale-110' : ''} />
                        <span className="text-[10px] font-bold">速记</span>
                    </button>

                    <button
                        onClick={() => setActiveTab('recent')}
                        className={`flex flex-col items-center gap-1 transition-all py-1.5 flex-1 ${activeTab === 'recent' ? 'text-teal-600' : 'text-gray-400 hover:text-gray-600'}`}
                    >
                        <History size={20} className={activeTab === 'recent' ? 'scale-110' : ''} />
                        <span className="text-[10px] font-bold">最近</span>
                    </button>

                    <button
                        onClick={() => setActiveTab('clip')}
                        className={`flex flex-col items-center gap-1 transition-all py-1.5 flex-1 ${activeTab === 'clip' ? 'text-teal-600' : 'text-gray-400 hover:text-gray-600'}`}
                    >
                        <Scissors size={20} className={activeTab === 'clip' ? 'scale-110' : ''} />
                        <span className="text-[10px] font-bold">剪藏</span>
                    </button>

                    <button
                        onClick={() => setActiveTab('prompt')}
                        className={`flex flex-col items-center gap-1 transition-all py-1.5 flex-1 ${activeTab === 'prompt' ? 'text-teal-600' : 'text-gray-400 hover:text-gray-600'}`}
                    >
                        <Sparkles size={20} className={activeTab === 'prompt' ? 'scale-110' : ''} />
                        <span className="text-[10px] font-bold">Prompt</span>
                    </button>

                    <button
                        onClick={() => setActiveTab('chat')}
                        className={`flex flex-col items-center gap-1 transition-all py-1.5 flex-1 ${activeTab === 'chat' ? 'text-teal-600' : 'text-gray-400 hover:text-gray-600'}`}
                    >
                        <MessageSquare size={20} className={activeTab === 'chat' ? 'scale-110' : ''} />
                        <span className="text-[10px] font-bold">AI Chat</span>
                    </button>
                </nav>
            )}
        </div>
    );
}

export default App;
