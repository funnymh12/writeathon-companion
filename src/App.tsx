import { useState, useEffect } from 'react';
import { storage } from './utils/storage';
import Settings from './components/Settings';
import Memo from './components/Memo';
import Recent from './components/Recent';
import Clipper from './components/Clipper';
import { Settings as SettingsIcon, LayoutGrid, PenLine, Paperclip } from 'lucide-react';

type Tab = 'memo' | 'recent' | 'clip' | 'settings';

function App() {
    const [isAuth, setIsAuth] = useState<boolean | null>(null);
    const [activeTab, setActiveTab] = useState<Tab>('memo');
    const [previousTab, setPreviousTab] = useState<Tab>('memo');

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
            case 'memo':
                return <Memo />;
            case 'recent':
                return <Recent />;
            case 'clip':
                return <Clipper />;
            case 'settings':
                return (
                    <Settings
                        onSuccess={() => { setIsAuth(true); setActiveTab('memo'); }}
                        onBack={handleSettingsBack}
                        isAuthenticated={isAuth === true}
                    />
                );
            default:
                return <Memo />;
        }
    };

    // Loading state
    if (isAuth === null) {
        return (
            <div className="flex h-screen items-center justify-center bg-white text-foreground text-sm font-medium">
                <div className="flex items-center gap-2 text-teal-500">
                    <div className="h-5 w-5 animate-spin rounded-full border-2 border-teal-500 border-t-transparent"></div>
                    <span className="text-gray-600">加载中...</span>
                </div>
            </div>
        );
    }

    return (
        <div className="flex h-screen flex-col bg-background text-foreground overflow-hidden">
            {/* Header - 写拉松风格 */}
            <header className="flex h-14 items-center justify-between border-b px-4 shrink-0 bg-white z-10">
                <div className="flex items-center gap-2">
                    <div className="w-8 h-8 bg-gradient-to-br from-teal-400 to-teal-600 rounded-full flex items-center justify-center shadow-sm">
                        <span className="text-white font-bold text-sm">写</span>
                    </div>
                    <span className="font-semibold text-base text-gray-800">写拉松小助手</span>
                </div>
                {isAuth && (
                    <button
                        onClick={() => handleTabChange('settings')}
                        className={`rounded-full p-2 hover:bg-teal-50 transition-colors ${activeTab === 'settings' ? 'text-teal-500 bg-teal-50' : 'text-gray-400 hover:text-teal-500'}`}
                    >
                        <SettingsIcon className="h-5 w-5" />
                    </button>
                )}
            </header>

            {/* Content */}
            <main className="flex-1 overflow-y-auto bg-gray-50">
                {renderContent()}
            </main>

            {/* Tab Bar - 写拉松风格 */}
            {isAuth && (activeTab !== 'settings') && (
                <nav className="flex h-16 border-t bg-white items-center justify-around px-2 shrink-0">
                    <button
                        onClick={() => setActiveTab('memo')}
                        className={`flex flex-col items-center gap-1 transition-colors py-2 px-4 rounded-lg ${activeTab === 'memo' ? 'text-teal-500' : 'text-gray-400 hover:text-teal-400'}`}
                    >
                        <PenLine className="h-5 w-5" />
                        <span className="text-[10px] font-medium">速记</span>
                    </button>

                    <button
                        onClick={() => setActiveTab('recent')}
                        className={`flex flex-col items-center gap-1 transition-colors py-2 px-4 rounded-lg ${activeTab === 'recent' ? 'text-teal-500' : 'text-gray-400 hover:text-teal-400'}`}
                    >
                        <LayoutGrid className="h-5 w-5" />
                        <span className="text-[10px] font-medium">最近</span>
                    </button>

                    <button
                        onClick={() => setActiveTab('clip')}
                        className={`flex flex-col items-center gap-1 transition-colors py-2 px-4 rounded-lg ${activeTab === 'clip' ? 'text-teal-500' : 'text-gray-400 hover:text-teal-400'}`}
                    >
                        <Paperclip className="h-5 w-5" />
                        <span className="text-[10px] font-medium">剪藏</span>
                    </button>
                </nav>
            )}
        </div>
    );
}

export default App;
