export interface WriteathonResponse<T> {
    success: boolean;
    data: T;
    message?: string;
}

export interface UserInfo {
    id: string;
    username: string;
}

export interface Space {
    id: string;
    title: string;
    description?: string;
}

export interface Card {
    _id: string;
    title: string;
    content?: string;
    created?: string;
    updated?: string;
}

export interface CreateCardParams {
    content: string;
    title?: string;
    space?: string;
    attachments?: string; // JSON stringify of Attachment[]
}

export interface Attachment {
    type: 'link' | 'image';
    title: string;
    url: string;
    excerpt?: string;
    from?: string;
    content?: string;
}

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

        const response = await fetch(url, {
            ...options,
            headers,
        });

        return await response.json();
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

    async getRecentCards(excludeDateTitle: boolean = false): Promise<WriteathonResponse<Card[]>> {
        return this.request<Card[]>(`/v1/users/:id/cards/recent?exclude_date_title=${excludeDateTitle}`);
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
