export interface AppStorage {
    token?: string;
    userId?: string;
    username?: string;
    selectedSpaceId?: string;
    selectedSpaceName?: string;
    shortcuts?: {
        toggleMemo: string;
        toggleRecent: string;
        toggleClip: string;
        quickSend: string;
        globalClip: string;
    };
}

export const storage = {
    get: async (): Promise<AppStorage> => {
        return new Promise((resolve) => {
            chrome.storage.local.get(['token', 'userId', 'username', 'selectedSpaceId', 'selectedSpaceName'], (result) => {
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
            chrome.storage.local.remove(['token', 'userId', 'username', 'selectedSpaceId', 'selectedSpaceName'], () => {
                resolve();
            });
        });
    }
};
