
import React, { useState } from 'react';
import { PenTool, Key, ArrowRight, CheckCircle2, Loader2, Globe } from 'lucide-react';
import { storage } from '../utils/storage';
import { WriteathonClient } from '../utils/api';

interface OnboardingProps {
    onComplete: () => void;
}

const Onboarding: React.FC<OnboardingProps> = ({ onComplete }) => {
    const [step, setStep] = useState<'welcome' | 'token'>('welcome');
    const [token, setToken] = useState('');
    const [baseUrl, setBaseUrl] = useState('https://writeathon.cn');
    const [verifying, setVerifying] = useState(false);
    const [error, setError] = useState('');

    const handleVerify = async () => {
        if (!token.trim()) {
            setError('请输入 Access Token');
            return;
        }

        setVerifying(true);
        setError('');

        try {
            // Validate Token
            const client = new WriteathonClient(token, '');
            // Temporarily override base URL if user changed it (though Client hardcodes it currently, 
            // usually we should pass it. Let's assume standard for now or update Client later)
            // For now, let's just save and verify.
            
            // We'll update storage first to let Client use it if it was reading from storage (it's not).
            // So we use the client instance directly.
            
            const userRes = await client.getMe();
            
            if (userRes.data && userRes.data.username) {
                // Success! Save to storage
                await storage.set({
                    token: token,
                    baseUrl: baseUrl,
                    userId: userRes.data.id,
                    username: userRes.data.username
                });
                onComplete();
            } else {
                setError('Token 无效，无法获取用户信息');
            }
        } catch (err) {
            setError('验证失败，请检查网络或 Token');
            console.error(err);
        } finally {
            setVerifying(false);
        }
    };

    return (
        <div className="flex flex-col h-screen bg-background text-foreground relative overflow-hidden">
            {/* Background Decoration */}
            <div className="absolute inset-0 z-0 pointer-events-none">
                <div className="absolute top-[-20%] right-[-10%] w-[80%] h-[80%] bg-primary/5 rounded-full blur-3xl" />
                <div className="absolute bottom-[-10%] left-[-10%] w-[60%] h-[60%] bg-teal-500/5 rounded-full blur-3xl" />
            </div>

            <div className="flex-1 flex flex-col items-center justify-center p-8 z-10 animate-in fade-in zoom-in duration-500">
                
                {/* Logo Section */}
                <div className="mb-8 relative group">
                    <div className="absolute -inset-4 bg-gradient-to-tr from-primary/20 to-emerald-400/20 rounded-full blur-xl opacity-50 group-hover:opacity-80 transition duration-500" />
                    <div className="relative w-20 h-20 bg-gradient-to-br from-primary to-teal-600 rounded-3xl shadow-2xl shadow-primary/30 flex items-center justify-center transform group-hover:scale-105 transition duration-300">
                        <PenTool className="h-10 w-10 text-white drop-shadow-md" />
                    </div>
                </div>

                <h1 className="text-3xl font-extrabold tracking-tight mb-2 bg-gradient-to-br from-foreground to-muted-foreground bg-clip-text text-transparent text-center">
                    Writeathon
                </h1>
                <p className="text-muted-foreground text-sm font-medium tracking-widest uppercase mb-12 text-center">
                    Companion Extension
                </p>

                {step === 'welcome' && (
                    <div className="w-full max-w-xs space-y-6 animate-in slide-in-from-bottom-4 duration-500 delay-100">
                        <div className="space-y-4">
                            <FeatureItem icon={<CheckCircle2 className="text-primary" />} text="随时随地捕捉灵感速记" />
                            <FeatureItem icon={<CheckCircle2 className="text-primary" />} text="一键剪藏网页全文或图片" />
                            <FeatureItem icon={<CheckCircle2 className="text-primary" />} text="AI 辅助写作与深度思考" />
                        </div>

                        <button
                            onClick={() => setStep('token')}
                            className="w-full group relative flex items-center justify-center gap-2 bg-primary hover:bg-primary/90 text-primary-foreground px-8 py-3.5 rounded-2xl font-bold text-base shadow-lg shadow-primary/20 hover:shadow-xl hover:shadow-primary/30 hover:-translate-y-0.5 transition-all duration-300"
                        >
                            <span>开始使用</span>
                            <ArrowRight className="h-4 w-4 group-hover:translate-x-1 transition-transform" />
                        </button>
                    </div>
                )}

                {step === 'token' && (
                    <div className="w-full max-w-xs space-y-6 animate-in slide-in-from-right-8 duration-300">
                        <div className="space-y-4">
                            <div className="space-y-1.5">
                                <label className="text-sm font-bold text-foreground flex items-center gap-2">
                                    <Key className="h-4 w-4 text-primary" />
                                    Access Token
                                </label>
                                <input
                                    type="password"
                                    value={token}
                                    onChange={(e) => setToken(e.target.value)}
                                    placeholder="粘贴你的 Token"
                                    className="w-full bg-card/50 backdrop-blur border border-border rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all placeholder:text-muted-foreground/40 shadow-sm"
                                    autoFocus
                                />
                                <p className="text-[10px] text-muted-foreground text-right">
                                    <a href="https://writeathon.cn/profile/api" target="_blank" className="text-primary hover:underline hover:text-primary/80 transition-colors">
                                        点击获取 Token &rarr;
                                    </a>
                                </p>
                            </div>

                            {/* Advanced Option Toggle (Hidden by default or simplified) */}
                            <div className="space-y-1.5">
                                <label className="text-xs font-bold text-muted-foreground flex items-center gap-2">
                                    <Globe className="h-3 w-3" />
                                    Server URL (Optional)
                                </label>
                                <input
                                    type="text"
                                    value={baseUrl}
                                    onChange={(e) => setBaseUrl(e.target.value)}
                                    className="w-full bg-muted/30 border border-border/50 rounded-lg px-3 py-2 text-xs focus:ring-1 focus:ring-primary/20 transition-all text-muted-foreground"
                                />
                            </div>
                        </div>

                        {error && (
                            <div className="text-destructive text-xs font-medium bg-destructive/10 px-3 py-2 rounded-lg flex items-center gap-2 animate-in shake">
                                <span className="w-1.5 h-1.5 rounded-full bg-destructive" />
                                {error}
                            </div>
                        )}

                        <button
                            onClick={handleVerify}
                            disabled={verifying}
                            className="w-full flex items-center justify-center gap-2 bg-foreground text-background hover:bg-foreground/90 px-8 py-3.5 rounded-2xl font-bold text-base shadow-lg hover:shadow-xl hover:-translate-y-0.5 transition-all duration-300 disabled:opacity-50 disabled:translate-y-0 disabled:shadow-none"
                        >
                            {verifying ? <Loader2 className="h-5 w-5 animate-spin" /> : '验证并登录'}
                        </button>
                        
                        <button 
                            onClick={() => setStep('welcome')}
                            className="w-full text-xs text-muted-foreground hover:text-foreground transition-colors py-2"
                        >
                            返回
                        </button>
                    </div>
                )}
            </div>
            
            {/* Footer decoration */}
            <div className="absolute bottom-4 left-0 right-0 text-center">
                 <span className="text-[10px] text-muted-foreground/30 font-mono">v1.0.5</span>
            </div>
        </div>
    );
};

const FeatureItem = ({ icon, text }: { icon: React.ReactNode, text: string }) => (
    <div className="flex items-center gap-3 bg-card/40 backdrop-blur-sm border border-white/10 p-3 rounded-xl">
        {icon}
        <span className="text-sm font-medium text-foreground/80">{text}</span>
    </div>
);

export default Onboarding;
