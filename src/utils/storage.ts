export interface AppStorage {
    token?: string;
    baseUrl?: string; // Writeathon API Base URL
    userId?: string;
    username?: string;
    selectedSpaceId?: string;
    selectedSpaceName?: string;
    // Image Hosting Config
    imageConfig?: {
        provider: 'imgbb' | 'qiniu';
        imgbb?: {
            apiKey: string;
        };
        qiniu?: {
            accessKey: string;
            secretKey: string;
            bucket: string;
            domain: string;
            region: string; // e.g. z0, z1, etc.
        };
    };
    // Deprecated but kept for migration if needed
    imgbbApiKey?: string;

    // Prompt config
    promptSpaceId?: string;
    pinnedPrompts?: string[];
    recentUsedPrompts?: { id: string; timestamp: number }[];

    shortcuts?: {
        quickSend?: string;
        globalClip?: string;
        openMemo?: string;
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
                // Migration logic for old imgbb key
                const data = result as AppStorage;
                if (!data.imageConfig && data.imgbbApiKey) {
                    data.imageConfig = {
                        provider: 'imgbb',
                        imgbb: { apiKey: data.imgbbApiKey }
                    };
                }
                resolve(data);
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
