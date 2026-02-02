import React, { useState, useEffect, useRef, useCallback } from 'react';
import { storage } from '../utils/storage';
import { WriteathonClient } from '../utils/api';
import {
    Send,
    Trash2,
    Sparkles,
    Loader2,
    Save,
    User,
    Bot,
    ChevronDown,
    RefreshCw,
    Copy,
    Check
} from 'lucide-react';

interface Message {
    role: 'user' | 'assistant';
    content: string;
    timestamp: number;
}

const AIChat: React.FC = () => {
    const [messages, setMessages] = useState<Message[]>([]);
    const [input, setInput] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [aiConfig, setAiConfig] = useState<any>(null);
    const [error, setError] = useState('');
    const [copied, setCopied] = useState(false);
    const messagesEndRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        loadData();
    }, []);

    useEffect(() => {
        scrollToBottom();
    }, [messages]);

    const loadData = async () => {
        const data = await storage.get();
        if (data.chatHistory) setMessages(data.chatHistory);
        if (data.aiConfig) setAiConfig(data.aiConfig);
    };

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    };

    const handleSend = async () => {
        if (!input.trim() || isLoading) return;
        if (!aiConfig || !aiConfig.providers[aiConfig.activeProvider].apiKey) {
            setError('请先在设置中配置 AI API Key');
            return;
        }

        const userMessage: Message = {
            role: 'user',
            content: input.trim(),
            timestamp: Date.now()
        };

        const newMessages = [...messages, userMessage];
        setMessages(newMessages);
        setInput('');
        setIsLoading(true);
        setError('');

        try {
            const provider = aiConfig.activeProvider;
            const config = aiConfig.providers[provider];

            // 构建请求
            let response;
            if (provider === 'gemini') {
                response = await callGemini(config, newMessages);
            } else {
                response = await callOpenAICompatible(provider, config, newMessages);
            }

            const assistantMessage: Message = {
                role: 'assistant',
                content: response,
                timestamp: Date.now()
            };

            const finalMessages = [...newMessages, assistantMessage];
            setMessages(finalMessages);
            await storage.set({ chatHistory: finalMessages });

        } catch (err: any) {
            setError(err.message || '对话失败，请检查网络或 API 配置');
        } finally {
            setIsLoading(false);
        }
    };

    const callGemini = async (config: any, history: Message[]) => {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${config.model}:generateContent?key=${config.apiKey}`;

        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: history.map(m => ({
                    role: m.role === 'user' ? 'user' : 'model',
                    parts: [{ text: m.content }]
                }))
            })
        });

        const data = await response.json();
        if (data.error) throw new Error(data.error.message);
        return data.candidates[0].content.parts[0].text;
    };

    const callOpenAICompatible = async (provider: string, config: any, history: Message[]) => {
        const baseUrl = config.baseUrl || (provider === 'openai' ? 'https://api.openai.com/v1' : '');
        if (!baseUrl) throw new Error(`${provider} 缺少 Base URL`);

        const response = await fetch(`${baseUrl}/chat/completions`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${config.apiKey}`
            },
            body: JSON.stringify({
                model: config.model,
                messages: history.map(m => ({
                    role: m.role,
                    content: m.content
                }))
            })
        });

        const data = await response.json();
        if (data.error) throw new Error(data.error.message);
        return data.choices[0].message.content;
    };

    const clearHistory = async () => {
        if (window.confirm('确定要清空聊天历史吗？')) {
            setMessages([]);
            await storage.set({ chatHistory: [] });
        }
    };

    const saveToWriteathon = async (content: string) => {
        try {
            const data = await storage.get();
            if (!data.token || !data.userId) {
                setError('请先登录写拉松');
                return;
            }

            const client = new WriteathonClient(data.token, data.userId);
            const res = await client.createCard({
                title: `AI 对话片段 ${new Date().toLocaleDateString()}`,
                content: content,
                space: data.selectedSpaceId
            });

            if (res.success) {
                alert('已保存到写拉松');
            } else {
                setError('保存失败: ' + res.message);
            }
        } catch (err) {
            setError('保存过程中出错');
        }
    };

    const copyToClipboard = (text: string) => {
        navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    return (
        <div className="flex flex-col h-full bg-white overflow-hidden relative">
            {/* Header */}
            <div className="px-4 py-3 border-b border-gray-50 bg-white z-10 sticky top-0 flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <div className="p-1.5 bg-teal-50 text-teal-600 rounded-lg">
                        <Sparkles size={16} />
                    </div>
                    <div>
                        <h3 className="text-sm font-bold text-gray-800">AI 助手</h3>
                        <p className="text-[10px] text-gray-400">当前: {aiConfig?.activeProvider} ({aiConfig?.providers[aiConfig?.activeProvider]?.model})</p>
                    </div>
                </div>
                <div className="flex items-center gap-1">
                    <button
                        onClick={clearHistory}
                        className="p-1.5 text-gray-400 hover:text-red-500 transition-colors"
                        title="清空记录"
                    >
                        <Trash2 size={16} />
                    </button>
                    <button
                        onClick={loadData}
                        className="p-1.5 text-gray-400 hover:text-teal-500 transition-colors"
                        title="同步配置"
                    >
                        <RefreshCw size={16} />
                    </button>
                </div>
            </div>

            {/* Message List */}
            <div className="flex-1 overflow-y-auto p-4 space-y-6 scrollbar-thin">
                {messages.length === 0 && (
                    <div className="h-full flex flex-col items-center justify-center opacity-40 space-y-4">
                        <div className="p-4 bg-gray-50 rounded-full">
                            <Bot size={40} className="text-gray-300" />
                        </div>
                        <p className="text-sm">今天想聊点什么？</p>
                    </div>
                )}

                {messages.map((msg, idx) => (
                    <div key={idx} className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
                        <div className={`flex items-center gap-2 mb-1 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}>
                            <div className={`p-1 rounded-md ${msg.role === 'user' ? 'bg-teal-100 text-teal-600' : 'bg-gray-100 text-gray-600'}`}>
                                {msg.role === 'user' ? <User size={12} /> : <Bot size={12} />}
                            </div>
                            <span className="text-[10px] text-gray-400 font-medium">
                                {msg.role === 'user' ? '我' : 'AI'} • {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </span>
                        </div>

                        <div className={`max-w-[90%] p-3 rounded-2xl text-sm leading-relaxed ${msg.role === 'user'
                                ? 'bg-teal-600 text-white rounded-tr-none'
                                : 'bg-gray-50 text-gray-800 rounded-tl-none border border-gray-100'
                            }`}>
                            <div className="whitespace-pre-wrap break-words">{msg.content}</div>

                            {msg.role === 'assistant' && (
                                <div className="mt-3 pt-2 border-t border-gray-100 flex items-center gap-3">
                                    <button
                                        onClick={() => copyToClipboard(msg.content)}
                                        className="flex items-center gap-1 text-[10px] text-gray-400 hover:text-teal-600 transition-colors"
                                    >
                                        {copied ? <Check size={10} /> : <Copy size={10} />}
                                        保存复制
                                    </button>
                                    <button
                                        onClick={() => saveToWriteathon(msg.content)}
                                        className="flex items-center gap-1 text-[10px] text-gray-400 hover:text-teal-600 transition-colors"
                                    >
                                        <Save size={10} />
                                        存入写拉松
                                    </button>
                                </div>
                            )}
                        </div>
                    </div>
                ))}

                {isLoading && (
                    <div className="flex items-start gap-2 animate-pulse">
                        <div className="p-1 bg-gray-100 text-gray-600 rounded-md">
                            <Bot size={12} />
                        </div>
                        <div className="bg-gray-50 border border-gray-100 p-3 rounded-2xl rounded-tl-none">
                            <Loader2 size={16} className="animate-spin text-teal-500" />
                        </div>
                    </div>
                )}
                <div ref={messagesEndRef} />
            </div>

            {/* Error Message */}
            {error && (
                <div className="px-4 py-2 bg-red-50 text-red-500 text-[10px] border-t border-red-100 flex items-center justify-between">
                    <span>{error}</span>
                    <button onClick={() => setError('')} className="font-bold">✕</button>
                </div>
            )}

            {/* Input Area */}
            <div className="p-4 bg-white border-t border-gray-50">
                <div className="relative">
                    <textarea
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter' && !e.shiftKey) {
                                e.preventDefault();
                                handleSend();
                            }
                        }}
                        placeholder="输入消息，Shift + Enter 换行..."
                        className="w-full bg-gray-50 border border-gray-100 rounded-2xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 transition-all resize-none max-h-32 min-h-[50px] scrollbar-none"
                    />
                    <button
                        onClick={handleSend}
                        disabled={!input.trim() || isLoading}
                        className={`absolute right-2 bottom-2 p-2 rounded-xl transition-all ${input.trim() && !isLoading
                                ? 'bg-teal-600 text-white shadow-lg shadow-teal-500/20 hover:scale-105 active:scale-95'
                                : 'bg-gray-100 text-gray-400'
                            }`}
                    >
                        {isLoading ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} />}
                    </button>
                </div>
                <div className="mt-2 flex items-center justify-center">
                    <p className="text-[10px] text-gray-300">使用 {aiConfig?.activeProvider || '默认'} 模型提供动力</p>
                </div>
            </div>
        </div>
    );
};

export default AIChat;
