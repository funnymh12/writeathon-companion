export interface AppStorage {
    token?: string;
    userId?: string;
    username?: string;
    selectedSpaceId?: string;
    selectedSpaceName?: string;
    imgbbApiKey?: string; // For image hosting
    // Prompt 管理相关
    promptSpaceId?: string;
    pinnedPrompts?: string[];
    recentUsedPrompts?: { id: string; timestamp: number }[];
    shortcuts?: {
        quickSend: string;
        globalClip: string;
    };
    enabledModules?: {
        memo: boolean;
        recent: boolean;
        clip: boolean;
        prompt: boolean;
        chat: boolean;
    };
    // AI Chat 相关配置
    aiConfig?: {
        activeProvider: 'openai' | 'gemini' | 'deepseek' | 'doubao' | 'custom';
        providers: {
            openai: { apiKey: string; model: string; baseUrl?: string };
            gemini: { apiKey: string; model: string };
            deepseek: { apiKey: string; model: string; baseUrl?: string };
            doubao: { apiKey: string; model: string; baseUrl?: string };
            custom: { apiKey: string; model: string; baseUrl: string };
        };
    };
    chatHistory?: { role: 'user' | 'assistant'; content: string; timestamp: number }[];
}

export const storage = {
    get: async (): Promise<AppStorage> => {
        return new Promise((resolve) => {
            chrome.storage.local.get([
                'token', 'userId', 'username', 'selectedSpaceId', 'selectedSpaceName',
                'imgbbApiKey', 'shortcuts', 'promptSpaceId', 'pinnedPrompts', 'recentUsedPrompts',
                'aiConfig', 'chatHistory', 'enabledModules'
            ], (result) => {
                resolve(result);
            });
        });
    },
    set: async (data: Partial<AppStorage>): Promise<void> => {
        return new Promise((resolve) => {
            chrome.storage.local.set(data, () => {
                resolve();
            });
        });
    },
    clear: async (): Promise<void> => {
        return new Promise((resolve) => {
            chrome.storage.local.remove(['token', 'userId', 'username', 'selectedSpaceId', 'selectedSpaceName', 'shortcuts'], () => {
                resolve();
            });
        });
    }
};
