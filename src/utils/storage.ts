export interface AppStorage {
    token?: string;
    baseUrl?: string; // Writeathon API Base URL
    userId?: string;
    username?: string;
    selectedSpaceId?: string;
    selectedSpaceName?: string;
    imgbbApiKey?: string; // For image hosting

    // Prompt config
    promptSpaceId?: string;
    pinnedPrompts?: string[];
    recentUsedPrompts?: { id: string; timestamp: number }[];

    shortcuts?: {
        quickSend?: string;
        globalClip?: string;
    };

    enabledModules?: {
        memo: boolean;
        recent: boolean;
        clip: boolean;
        prompt: boolean;
        chat: boolean;
    };

    // AI Chat Config (Simplified)
    aiConfig?: {
        provider: 'gemini' | 'openai' | 'custom';
        apiKey: string;
        model: string;
        baseUrl?: string; // For openai/custom
    };

    chatHistory?: { role: 'user' | 'assistant'; content: string; timestamp: number }[];
}

export const storage = {
    get: async (): Promise<AppStorage> => {
        return new Promise((resolve) => {
            chrome.storage.local.get(null, (result) => {
                resolve(result as AppStorage);
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
            chrome.storage.local.clear(() => {
                resolve();
            });
        });
    }
};
