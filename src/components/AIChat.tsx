import React, { useState, useEffect, useRef } from 'react';
import { WriteathonClient } from '../utils/api';
import { storage } from '../utils/storage';
import { Send, Loader2, Trash2, Bot, User, Sparkles, Copy, Check, ChevronDown, Settings as SettingsIcon } from 'lucide-react';
import ReactMarkdown from 'react-markdown';

interface Message {
    role: 'user' | 'assistant';
    content: string;
    timestamp: number;
}

const AIChat: React.FC = () => {
    const [messages, setMessages] = useState<Message[]>([]);
    const [input, setInput] = useState('');
    const [loading, setLoading] = useState(false);
    const [config, setConfig] = useState<any>(null);
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const [copiedIndex, setCopiedIndex] = useState<number | null>(null);

    // Auto-scroll to bottom
    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    };

    useEffect(() => {
        scrollToBottom();
    }, [messages]);

    useEffect(() => {
        loadConfig();
        loadHistory();
    }, []);

    const loadConfig = async () => {
        const data = await storage.get();
        setConfig(data.aiConfig || { provider: 'gemini', model: 'gemini-2.0-flash-exp' });
    };

    const loadHistory = async () => {
        const data = await storage.get();
        if (data.chatHistory) {
            setMessages(data.chatHistory);
        }
    };

    const saveHistory = async (newMessages: Message[]) => {
        await storage.set({ chatHistory: newMessages });
    };

    const handleSend = async () => {
        if (!input.trim() || loading) return;

        const userMsg: Message = { role: 'user', content: input, timestamp: Date.now() };
        const updatedMessages = [...messages, userMsg];
        setMessages(updatedMessages);
        setInput('');
        setLoading(true);
        saveHistory(updatedMessages);

        try {
            if (!config?.apiKey) throw new Error('请先在设置中配置 API Key');

            let responseText = '';

            if (config.provider === 'gemini') {
                responseText = await callGemini(updatedMessages);
            } else {
                // Open AI Compatible (openai or custom)
                responseText = await callOpenAICompatible(updatedMessages);
            }

            const aiMsg: Message = { role: 'assistant', content: responseText, timestamp: Date.now() };
            const finalMessages = [...updatedMessages, aiMsg];
            setMessages(finalMessages);
            saveHistory(finalMessages);

        } catch (err: any) {
            const errorMsg: Message = { role: 'assistant', content: `Error: ${err.message}`, timestamp: Date.now() };
            setMessages([...updatedMessages, errorMsg]);
        } finally {
            setLoading(false);
        }
    };

    const callGemini = async (history: Message[]) => {
        const cleanBaseUrl = (config.baseUrl || 'https://generativelanguage.googleapis.com').replace(/\/+$/, '');
        const url = `${cleanBaseUrl}/v1beta/models/${config.model}:generateContent?key=${config.apiKey}`;

        // Gemini format
        const contents = history.map(m => ({
            role: m.role === 'user' ? 'user' : 'model',
            parts: [{ text: m.content }]
        }));

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
    };

    const callOpenAICompatible = async (history: Message[]) => {
        const baseUrl = (config.baseUrl || 'https://api.openai.com/v1').replace(/\/+$/, '');

        const msgs = history.map(m => ({
            role: m.role === 'user' ? 'user' : 'assistant',
            content: m.content
        }));

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
    };

    const clearHistory = async () => {
        setMessages([]);
        await storage.set({ chatHistory: [] });
    };

    const copyMessage = (content: string, index: number) => {
        navigator.clipboard.writeText(content);
        setCopiedIndex(index);
        setTimeout(() => setCopiedIndex(null), 2000);
    };

    const handleModelChange = (newModel: string) => {
        const newConfig = { ...config, model: newModel };
        setConfig(newConfig);
        storage.set({ aiConfig: newConfig });
    };

    return (
        <div className="flex flex-col h-full bg-white relative">
            {/* Header: Model Selector */}
            <div className="px-5 py-3 border-b border-gray-50 flex items-center justify-between bg-white/80 backdrop-blur z-10 sticky top-0">
                <div className="flex items-center gap-2 group relative">
                    <div className="p-1.5 bg-gradient-to-tr from-teal-500 to-emerald-500 rounded-lg text-white shadow-sm">
                        <Bot className="h-4 w-4" />
                    </div>
                    <div>
                        {config?.provider === 'gemini' ? (
                            <div className="relative group/select">
                                <select
                                    value={config.model}
                                    onChange={(e) => handleModelChange(e.target.value)}
                                    className="appearance-none bg-transparent font-bold text-xs text-gray-700 focus:outline-none cursor-pointer hover:text-teal-600 transition-colors py-1 pr-6"
                                >
                                    <option value="gemini-2.0-flash-exp">Gemini 2.0 Flash</option>
                                    <option value="gemini-1.5-pro">Gemini 1.5 Pro</option>
                                    <option value="gemini-1.5-flash">Gemini 1.5 Flash</option>
                                </select>
                                <ChevronDown className="absolute right-0 top-1/2 -translate-y-1/2 h-3 w-3 text-gray-400 pointer-events-none group-hover/select:text-teal-500 transition-colors mt-[1px]" />
                            </div>
                        ) : (
                            <div className="text-xs font-bold text-gray-700 py-1">
                                {config?.model || 'AI Model'}
                            </div>
                        )}
                        <div className="text-[9px] text-gray-400 font-medium -mt-1 pl-0.5 capitalize">{config?.provider || 'AI'} Assistant</div>
                    </div>
                </div>

                <button
                    onClick={clearHistory}
                    className="p-2 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all"
                    title="清空历史"
                >
                    <Trash2 className="h-4 w-4" />
                </button>
            </div>

            {/* Messages Area */}
            <div className="flex-1 overflow-y-auto px-4 py-4 space-y-6 scrollbar-thin">
                {messages.length === 0 ? (
                    <div className="h-full flex flex-col items-center justify-center text-gray-300 gap-4 opacity-50 pb-20">
                        <div className="w-16 h-16 bg-gradient-to-br from-teal-50 to-emerald-50 rounded-full flex items-center justify-center mb-2">
                            <Sparkles className="h-8 w-8 text-teal-200" />
                        </div>
                        <p className="text-xs text-center max-w-[200px] leading-relaxed">
                            你好！我是你的 AI 助手。<br />
                            有什么可以帮你的吗？
                        </p>
                    </div>
                ) : (
                    messages.map((msg, index) => (
                        <div
                            key={index}
                            className={`flex gap-3 animate-in slide-in-from-bottom-2 duration-300 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}
                        >
                            <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 shadow-sm ${msg.role === 'user'
                                    ? 'bg-gray-100/50 text-gray-500'
                                    : 'bg-gradient-to-br from-teal-500 to-emerald-500 text-white'
                                }`}>
                                {msg.role === 'user' ? <User className="h-4 w-4" /> : <Bot className="h-4 w-4" />}
                            </div>

                            <div className={`group relative max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-relaxed shadow-sm ${msg.role === 'user'
                                    ? 'bg-white border border-gray-100 text-gray-800 rounded-tr-sm'
                                    : 'bg-white border border-gray-100 text-gray-700 rounded-tl-sm'
                                }`}>
                                <div className="prose prose-sm prose-teal max-w-none break-words">
                                    <ReactMarkdown>{msg.content}</ReactMarkdown>
                                </div>

                                {/* Copy Button */}
                                <button
                                    onClick={() => copyMessage(msg.content, index)}
                                    className={`absolute -bottom-6 ${msg.role === 'user' ? 'right-0' : 'left-0'} p-1 text-gray-300 hover:text-teal-600 transition-colors opacity-0 group-hover:opacity-100`}
                                    title="复制"
                                >
                                    {copiedIndex === index ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                                </button>
                            </div>
                        </div>
                    ))
                )}
                {loading && (
                    <div className="flex gap-3">
                        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-teal-500 to-emerald-500 text-white flex items-center justify-center shrink-0 shadow-sm">
                            <Bot className="h-4 w-4" />
                        </div>
                        <div className="bg-white border border-gray-100 rounded-2xl rounded-tl-sm px-4 py-3 shadow-sm flex items-center gap-1.5">
                            <div className="w-1.5 h-1.5 bg-teal-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                            <div className="w-1.5 h-1.5 bg-teal-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                            <div className="w-1.5 h-1.5 bg-teal-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                        </div>
                    </div>
                )}
                <div ref={messagesEndRef} />
            </div>

            {/* Input Area */}
            <div className="p-4 bg-white border-t border-gray-50 z-20">
                <div className="relative flex items-end gap-2 bg-gray-50/50 rounded-2xl border border-gray-200/50 p-2 focus-within:bg-white focus-within:border-teal-200 focus-within:ring-2 focus-within:ring-teal-50 transition-all shadow-sm">
                    <textarea
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter' && !e.shiftKey) {
                                e.preventDefault();
                                handleSend();
                            }
                        }}
                        placeholder="输入消息..."
                        className="flex-1 max-h-32 min-h-[44px] bg-transparent border-none focus:ring-0 text-sm py-3 px-2 resize-none placeholder:text-gray-400 text-gray-700 leading-relaxed"
                        disabled={loading}
                        rows={1}
                    />
                    <button
                        onClick={handleSend}
                        disabled={!input.trim() || loading}
                        className={`p-2.5 rounded-xl transition-all mb-0.5 shrink-0 ${input.trim() && !loading
                                ? 'bg-teal-500 text-white hover:bg-teal-600 shadow-md shadow-teal-200'
                                : 'bg-gray-200 text-gray-400 cursor-not-allowed'
                            }`}
                    >
                        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                    </button>
                </div>
                <div className="text-[10px] text-center text-gray-300 mt-2 font-medium">
                    AI 可能产生错误信息，请核对重要事实
                </div>
            </div>
        </div>
    );
};

export default AIChat;
