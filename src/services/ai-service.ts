import { storage } from '../utils/storage';

export interface ChatMessage {
    role: 'user' | 'assistant';
    content: string;
    timestamp: number;
}

export interface AIConfig {
    provider: 'gemini' | 'openai' | 'custom';
    apiKey: string;
    model: string;
    baseUrl?: string;
}

export class AIService {
    private async getConfig(): Promise<AIConfig> {
        const data = await storage.get();
        if (!data.aiConfig?.apiKey) {
            throw new Error('请先在设置中配置 API Key');
        }
        return data.aiConfig;
    }

    async generateResponse(messages: ChatMessage[]): Promise<string> {
        const config = await this.getConfig();

        if (config.provider === 'gemini') {
            return this.callGemini(config, messages);
        } else {
            return this.callOpenAICompatible(config, messages);
        }
    }

    // TODO: Implement streaming support
    async *generateStreamResponse(messages: ChatMessage[]): AsyncGenerator<string> {
        const config = await this.getConfig();
        // Placeholder for future streaming implementation
        const response = await this.generateResponse(messages);
        yield response;
    }

    private async callGemini(config: AIConfig, history: ChatMessage[]): Promise<string> {
        const cleanBaseUrl = (config.baseUrl || 'https://generativelanguage.googleapis.com').replace(/\/+$/, '');
        const url = `${cleanBaseUrl}/v1beta/models/${config.model}:generateContent?key=${config.apiKey}`;

        // Gemini format
        const contents = history.map(m => ({
            role: m.role === 'user' ? 'user' : 'model',
            parts: [{ text: m.content }]
        }));

        try {
            const response = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ contents })
            });

            if (!response.ok) {
                const err = await response.json();
                throw new Error(err.error?.message || '请求失败');
            }

            const data = await response.json();
            return data.candidates?.[0]?.content?.parts?.[0]?.text || '无回复';
        } catch (error: any) {
            console.error('Gemini API Error:', error);
            throw new Error(error.message || '调用 Gemini 失败');
        }
    }

    private async callOpenAICompatible(config: AIConfig, history: ChatMessage[]): Promise<string> {
        const baseUrl = (config.baseUrl || 'https://api.openai.com/v1').replace(/\/+$/, '');

        const msgs = history.map(m => ({
            role: m.role === 'user' ? 'user' : 'assistant',
            content: m.content
        }));

        try {
            const response = await fetch(`${baseUrl}/chat/completions`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${config.apiKey}`
                },
                body: JSON.stringify({
                    model: config.model,
                    messages: msgs
                })
            });

            if (!response.ok) {
                const err = await response.json();
                throw new Error(err.error?.message || '请求失败');
            }

            const data = await response.json();
            return data.choices?.[0]?.message?.content || '无回复';
        } catch (error: any) {
            console.error('OpenAI API Error:', error);
            throw new Error(error.message || '调用 API 失败');
        }
    }
}

export const aiService = new AIService();
