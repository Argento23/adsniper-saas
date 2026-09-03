import Link from 'next/link';
import { UserButton } from '@clerk/nextjs';
import StudioSidebar from './components/StudioSidebar';

export default function StudioLayout({ children }: { children: React.ReactNode }) {
    return (
        <div className="min-h-screen bg-slate-950 text-slate-100 font-sans selection:bg-emerald-500/30">
            <div className="fixed inset-0 pointer-events-none overflow-hidden">
                <div className="absolute top-0 left-1/4 w-[500px] h-[500px] bg-indigo-500/10 rounded-full blur-[100px] animate-pulse" />
                <div className="absolute bottom-0 right-1/4 w-[500px] h-[500px] bg-emerald-500/5 rounded-full blur-[120px]" />
            </div>

            <div className="relative z-10 flex">
                <StudioSidebar />

                <div className="flex-1 min-h-screen flex flex-col">
                    <header className="flex justify-between items-center px-6 md:px-10 h-16 border-b border-white/5 bg-black/20 backdrop-blur-xl">
                        <div className="flex items-center gap-3">
                            <div className="w-8 h-8 bg-gradient-to-br from-emerald-500 to-cyan-600 rounded-lg flex items-center justify-center shadow-lg shadow-emerald-500/20 p-1.5">
                                <span className="text-white font-black text-sm">S</span>
                            </div>
                            <div className="flex flex-col">
                                <span className="text-sm font-bold tracking-tight">Adsíntesis Studio</span>
                                <span className="text-[10px] text-slate-500 uppercase tracking-wider">AI Creative Workspace</span>
                            </div>
                        </div>
                        <div className="flex items-center gap-3">
                            <Link
                                href="/dashboard"
                                className="text-xs font-bold text-slate-400 hover:text-white px-3 py-1.5 rounded-lg border border-white/10 hover:border-white/20 transition-colors"
                            >
                                ← Dashboard
                            </Link>
                            <UserButton afterSignOutUrl="/" />
                        </div>
                    </header>

                    <main className="flex-1 px-6 md:px-10 py-8">
                        {children}
                    </main>
                </div>
            </div>
        </div>
    );
}
