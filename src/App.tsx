import { useState, useEffect } from 'react';
import { storage } from './utils/storage';
import Settings from './components/Settings';
import Memo from './components/Memo';
import Recent from './components/Recent';
import Clipper from './components/Clipper';
import { Settings as SettingsIcon, LayoutGrid, PenLine } from 'lucide-react';

type Tab = 'memo' | 'recent' | 'clip' | 'settings';

function App() {
    const [isAuth, setIsAuth] = useState<boolean | null>(null);
    const [activeTab, setActiveTab] = useState<Tab>('memo');

    useEffect(() => {
        checkAuth();
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

    if (isAuth === null) {
        return (
            <div className="flex h-screen items-center justify-center bg-background text-foreground text-sm font-medium">
                <div className="flex items-center gap-2">
                    <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent"></div>
                    加载中...
                </div>
            </div>
        );
    }

    const renderContent = () => {
        switch (activeTab) {
            case 'memo':
                return <Memo />;
            case 'recent':
                return <Recent />;
            case 'clip':
                return <Clipper />;
            case 'settings':
                return <Settings onSuccess={() => { setIsAuth(true); setActiveTab('memo'); }} />;
            default:
                return <Memo />;
        }
    };

    return (
        <div className="flex h-screen flex-col bg-background text-foreground overflow-hidden">
            {/* Header */}
            <header className="flex h-12 items-center justify-between border-b px-4 shrink-0 bg-white z-10">
                <div className="flex items-center gap-2">
                    <LayoutGrid className="h-5 w-5 text-black" />
                    <span className="font-bold text-sm tracking-tight text-black">写拉松</span>
                </div>
                {isAuth && (
                    <button
                        onClick={() => setActiveTab('settings')}
                        className={`rounded-full p-2 hover:bg-muted transition-colors ${activeTab === 'settings' ? 'text-black bg-gray-100' : 'text-muted-foreground'}`}
                    >
                        <SettingsIcon className="h-5 w-5" />
                    </button>
                )}
            </header>

            {/* Content */}
            <main className="flex-1 overflow-y-auto bg-[#fafafa]">
                {renderContent()}
            </main>

            {/* Tab Bar */}
            {isAuth && (activeTab !== 'settings') && (
                <nav className="flex h-16 border-t bg-white items-center justify-around px-2 shrink-0">
                    <button
                        onClick={() => setActiveTab('memo')}
                        className={`flex flex-col items-center gap-1 transition-colors ${activeTab === 'memo' ? 'text-black' : 'text-muted-foreground hover:text-gray-600'}`}
                    >
                        <PenLine className="h-6 w-6" />
                        <span className="text-[10px] font-bold tracking-wide">速记</span>
                    </button>

                    <button
                        onClick={() => setActiveTab('recent')}
                        className={`flex flex-col items-center gap-1 transition-colors ${activeTab === 'recent' ? 'text-black' : 'text-muted-foreground hover:text-gray-600'}`}
                    >
                        <LayoutGrid className="h-6 w-6" />
                        <span className="text-[10px] font-bold tracking-wide">最近</span>
                    </button>

                    <button
                        onClick={() => setActiveTab('clip')}
                        className={`flex flex-col items-center gap-1 transition-colors ${activeTab === 'clip' ? 'text-black' : 'text-muted-foreground hover:text-gray-600'}`}
                    >
                        <svg
                            className="h-6 w-6"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                            xmlns="http://www.w3.org/2000/svg"
                        >
                            <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.414a4 4 0 00-5.656-5.656l-6.415 6.414a6 6 0 108.486 8.486L20.5 13"
                            />
                        </svg>
                        <span className="text-[10px] font-bold tracking-wide">剪藏</span>
                    </button>
                </nav>
            )}
        </div>
    );
}

export default App;
