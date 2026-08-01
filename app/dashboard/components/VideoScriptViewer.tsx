'use client';

import { FaRegCopy, FaVideo, FaPlay, FaMusic, FaCheck } from 'react-icons/fa';
import { useState } from 'react';

interface ScriptSection {
    type: 'Hook' | 'Body' | 'CTA';
    content: string;
    duration?: string;
}

interface VideoScript {
    title: string;
    angle: string;
    audio_suggestion?: string;
    platform?: string;
    sections: ScriptSection[];
}

interface VideoScriptViewerProps {
    scripts: VideoScript[];
}

export default function VideoScriptViewer({ scripts }: VideoScriptViewerProps) {
    const [copiedIndex, setCopiedIndex] = useState<string | null>(null);

    const copyToClipboard = (text: string, id: string) => {
        navigator.clipboard.writeText(text);
        setCopiedIndex(id);
        setTimeout(() => setCopiedIndex(null), 2000);
    };

    if (!scripts || scripts.length === 0) {
        return (
            <div className="text-center py-12 border border-slate-800 rounded-3xl bg-slate-900/30">
                <FaVideo className="w-12 h-12 mx-auto mb-4 text-slate-600" />
                <p className="text-slate-400">Genera una campaña para ver los guiones de video.</p>
            </div>
        );
    }

    return (
        <div className="grid md:grid-cols-2 gap-6 animate-in fade-in slide-in-from-bottom-4 duration-700 delay-200">
            {scripts.map((script, i) => (
                <div key={i} className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden hover:border-emerald-500/30 transition-all group">

                    {/* Header */}
                    <div className="bg-slate-950 p-4 border-b border-slate-800 flex justify-between items-center">
                        <div>
                            <div className="flex items-center gap-2 mb-1">
                                <span className={`w-2 h-2 rounded-full ${i === 0 ? 'bg-purple-500' : 'bg-pink-500'}`}></span>
                                <h3 className="font-bold text-white">{script.title || `Guion Viral #${i + 1}`}</h3>
                            </div>
                            <span className="text-xs text-slate-500 uppercase tracking-wider font-bold">{script.angle} Angle</span>
                            {script.platform && (
                                <span className={`text-xs ml-2 px-2 py-0.5 rounded-full font-bold ${script.platform.includes('TikTok') ? 'bg-pink-900/30 text-pink-300 border border-pink-500/20' :
                                        script.platform.includes('Reels') ? 'bg-purple-900/30 text-purple-300 border border-purple-500/20' :
                                            'bg-red-900/30 text-red-300 border border-red-500/20'
                                    }`}>{script.platform}</span>
                            )}
                        </div>
                        <div className="p-2 bg-slate-900 rounded-lg border border-slate-800 text-slate-400">
                            <FaVideo className="w-5 h-5" />
                        </div>
                    </div>

                    {/* Content */}
                    <div className="p-6 space-y-6">
                        {script.audio_suggestion && (
                            <div className="flex items-center gap-3 p-3 bg-purple-900/20 text-purple-200 rounded-lg border border-purple-500/20 text-sm">
                                <FaMusic className="w-4 h-4" />
                                <span>🎵 Audio: {script.audio_suggestion}</span>
                            </div>
                        )}

                        <div className="space-y-4">
                            {script.sections?.map((section, idx) => (
                                <div key={idx} className="relative pl-6 border-l-2 border-slate-800 hover:border-emerald-500/50 transition-colors pb-1">
                                    <div className="absolute -left-[5px] top-0 w-2 h-2 rounded-full bg-slate-800 group-hover:bg-emerald-500 transition-colors"></div>
                                    <p className="text-xs text-slate-500 uppercase tracking-widest font-bold mb-1">{section.type} {section.duration && `• ${section.duration}`}</p>
                                    <p className="text-slate-300 leading-relaxed text-sm bg-slate-950/50 p-3 rounded-lg border border-slate-800/50">
                                        {section.content}
                                    </p>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Footer Actions */}
                    <div className="p-4 bg-slate-950 border-t border-slate-800 flex justify-end">
                        <button
                            onClick={() => {
                                const fullText = (script.sections || []).map(s => `[${s.type}] ${s.content}`).join('\n\n');
                                copyToClipboard(fullText, `full-${i}`);
                            }}
                            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all ${copiedIndex === `full-${i}` ? 'bg-emerald-500 text-white' : 'bg-white text-slate-900 hover:bg-emerald-400'}`}
                        >
                            {copiedIndex === `full-${i}` ? <FaCheck className="w-4 h-4" /> : <FaRegCopy className="w-4 h-4" />}
                            {copiedIndex === `full-${i}` ? 'Copiado!' : 'Copiar Guion'}
                        </button>
                    </div>
                </div>
            ))}
        </div>
    );
}
