
export interface WriteathonResponse<T> {
    success: boolean;
    data: T;
    message?: string;
    errorCode?: number;
}

export interface UserInfo {
    id: string;
    username: string;
}

export interface Space {
    id: string;
    _id?: string;
    title: string;
    description?: string;
}

export interface Card {
    _id?: string;
    id?: string;
    title: string;
    content?: string;
    created?: string;
    updated?: string;
}

export interface CreateCardParams {
    content: string;
    title?: string;
    space?: string;
    attachments?: string;
}

export interface Attachment {
    type: 'link' | 'image';
    title: string;
    url: string;
    excerpt?: string;
    from?: string;
    content?: string;
}

// --- Custom Error Classes ---

export class ApiError extends Error {
    constructor(message: string, public statusCode?: number, public errorCode?: number) {
        super(message);
        this.name = 'ApiError';
    }
}

export class AuthError extends ApiError {
    constructor(message = 'Authentication failed') {
        super(message, 401);
        this.name = 'AuthError';
    }
}

export class NetworkError extends ApiError {
    constructor(message = 'Network request failed') {
        super(message);
        this.name = 'NetworkError';
    }
}

// --- Client ---

export class WriteathonClient {
    private baseUrl = 'https://api.writeathon.cn';
    private token: string;
    private userId: string;

    constructor(token: string, userId: string = '') {
        this.token = token;
        this.userId = userId;
    }

    setUserId(userId: string) {
        this.userId = userId;
    }

    private async request<T>(endpoint: string, options: RequestInit = {}): Promise<WriteathonResponse<T>> {
        const url = `${this.baseUrl}${endpoint.replace(':id', this.userId)}`;
        const headers = {
            'Content-Type': 'application/json',
            'x-writeathon-token': this.token,
            ...options.headers,
        };

        try {
            const response = await fetch(url, {
                ...options,
                headers,
            });

            // Handle HTTP Status Codes
            if (response.status === 401) {
                throw new AuthError('登录已过期，请重新登录');
            }
            if (response.status === 429) {
                throw new ApiError('请求过于频繁，请稍后再试', 429);
            }
            if (!response.ok) {
                throw new ApiError(`HTTP Error: ${response.status}`, response.status);
            }

            const data: WriteathonResponse<T> = await response.json();

            // Handle Logical Errors from API
            if (!data.success) {
                throw new ApiError(data.message || 'Unknown API Error', 200, data.errorCode);
            }

            return data;

        } catch (error) {
            if (error instanceof ApiError) {
                throw error;
            }
            // Network errors or other fetch issues
            throw new NetworkError(error instanceof Error ? error.message : 'Network Error');
        }
    }

    async getMe(): Promise<WriteathonResponse<UserInfo>> {
        return this.request<UserInfo>('/v1/me');
    }

    async getSpaces(): Promise<WriteathonResponse<Space[]>> {
        return this.request<Space[]>('/v1/users/:id/spaces');
    }

    async createCard(params: CreateCardParams): Promise<WriteathonResponse<any>> {
        return this.request('/v1/users/:id/cards', {
            method: 'POST',
            body: JSON.stringify(params),
        });
    }

    async getRecentCards(excludeDateTitle: boolean = false, spaceId?: string): Promise<WriteathonResponse<Card[]>> {
        let query = excludeDateTitle ? '?exclude_date_title=true' : '?';
        if (!query.endsWith('?')) query += '&';

        query += 'limit=50';

        if (spaceId) {
            query += `&space=${spaceId}`;
        }
        return this.request<Card[]>(`/v1/users/:id/cards/recent${query}`);
    }

    async getCardDetail(cardId: string): Promise<WriteathonResponse<Card>> {
        return this.request<Card>('/v1/users/:id/cards/get', {
            method: 'POST',
            body: JSON.stringify({ id: cardId }),
        });
    }

    async extendCard(parent: string, content: string, title?: string): Promise<WriteathonResponse<any>> {
        return this.request('/v1/users/:id/cards/extend', {
            method: 'POST',
            body: JSON.stringify({ parent, content, title }),
        });
    }

    async writingPick(type: 'all' | 'page' | 'card' = 'card', limit: number = 5): Promise<WriteathonResponse<Card[]>> {
        return this.request<Card[]>('/v1/users/:id/writing-pick', {
            method: 'POST',
            body: JSON.stringify({ type, limit }),
        });
    }
}
