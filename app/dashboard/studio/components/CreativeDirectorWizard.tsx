'use client';

import { useState } from 'react';
import { FaMagic, FaTimes } from 'react-icons/fa';
import { CreativeBrief, CreativeSpec, StylePresetId } from '@/lib/creative-director';
import { listStylePresets } from '@/lib/creative-director';
import { Scene } from '@/lib/projects/types';
import StoryboardReview from './StoryboardReview';

interface CreativeDirectorWizardProps {
    projectId: string;
    onClose: () => void;
    onScenesCommitted: (scenes: Scene[]) => void;
}

export default function CreativeDirectorWizard({ projectId, onClose, onScenesCommitted }: CreativeDirectorWizardProps) {
    const presets = listStylePresets();
    const [step, setStep] = useState<'brief' | 'review'>('brief');
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [spec, setSpec] = useState<CreativeSpec | null>(null);
    const [drafts, setDrafts] = useState<Scene[] | null>(null);

    const [businessName, setBusinessName] = useState('');
    const [product, setProduct] = useState('');
    const [category, setCategory] = useState('');
    const [objective, setObjective] = useState<'ventas' | 'branding' | 'lanzamiento' | 'engagement'>('ventas');
    const [audience, setAudience] = useState('');
    const [platform, setPlatform] = useState<'reels' | 'tiktok' | 'shorts'>('reels');
    const [duration, setDuration] = useState<15 | 20 | 30>(20);
    const [visualStyle, setVisualStyle] = useState<StylePresetId>('cinematografico');
    const [cta, setCta] = useState('');
    const [additionalNotes, setAdditionalNotes] = useState('');

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        setSubmitting(true);
        setError(null);
        try {
            const brief: CreativeBrief = {
                businessName,
                product,
                category,
                objective,
                audience,
                platform,
                duration,
                visualStyle,
                language: 'es-AR',
                cta,
                additionalNotes: additionalNotes || undefined,
            };
            const res = await fetch('/api/studio/creative-director/brief', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ...brief, projectId }),
            });
            const data = await res.json();
            if (!res.ok) {
                if (data.validation) {
                    setError(data.validation.map((v: { field: string; message: string }) => `${v.field}: ${v.message}`).join(' | '));
                } else {
                    setError(data.error || `HTTP ${res.status}`);
                }
                return;
            }
            setSpec(data.spec);
            setDrafts(data.sceneDrafts);
            setStep('review');
        } catch (e: unknown) {
            setError(e instanceof Error ? e.message : 'failed');
        } finally {
            setSubmitting(false);
        }
    }

    return (
        <div className="bg-slate-900/60 border border-white/10 rounded-2xl p-6 backdrop-blur-xl space-y-4">
            <div className="flex items-center justify-between">
                <h3 className="text-lg font-bold text-white flex items-center gap-2">
                    <FaMagic className="text-emerald-400" />
                    Creative Director IA
                </h3>
                <button onClick={onClose} className="text-slate-500 hover:text-white">
                    <FaTimes />
                </button>
            </div>

            {step === 'brief' && (
                <form onSubmit={handleSubmit} className="space-y-4">
                    <div className="text-xs text-slate-400">
                        Paso 1 de 2 · Brief comercial
                    </div>

                    <div className="grid md:grid-cols-2 gap-4">
                        <div>
                            <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Negocio *</label>
                            <input type="text" required value={businessName} onChange={e => setBusinessName(e.target.value)} className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-white text-sm focus:border-emerald-500/50 outline-none" />
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Producto *</label>
                            <input type="text" required value={product} onChange={e => setProduct(e.target.value)} className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-white text-sm focus:border-emerald-500/50 outline-none" />
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Categoría *</label>
                            <input type="text" required value={category} onChange={e => setCategory(e.target.value)} className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-white text-sm focus:border-emerald-500/50 outline-none" placeholder="Ej: Gastronomía" />
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Objetivo *</label>
                            <select value={objective} onChange={e => setObjective(e.target.value as typeof objective)} className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-white text-sm focus:border-emerald-500/50 outline-none">
                                <option value="ventas">Ventas</option>
                                <option value="branding">Branding</option>
                                <option value="lanzamiento">Lanzamiento</option>
                                <option value="engagement">Engagement</option>
                            </select>
                        </div>
                        <div className="md:col-span-2">
                            <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Público *</label>
                            <input type="text" required value={audience} onChange={e => setAudience(e.target.value)} className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-white text-sm focus:border-emerald-500/50 outline-none" placeholder="Ej: jóvenes urbanos 18-35 que aman el café de especialidad" />
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Plataforma *</label>
                            <select value={platform} onChange={e => setPlatform(e.target.value as typeof platform)} className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-white text-sm focus:border-emerald-500/50 outline-none">
                                <option value="reels">Instagram Reels</option>
                                <option value="tiktok">TikTok</option>
                                <option value="shorts">YouTube Shorts</option>
                            </select>
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Duración *</label>
                            <select value={duration} onChange={e => setDuration(Number(e.target.value) as 15 | 20 | 30)} className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-white text-sm focus:border-emerald-500/50 outline-none">
                                <option value={15}>15 segundos</option>
                                <option value={20}>20 segundos</option>
                                <option value={30}>30 segundos</option>
                            </select>
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Estilo visual *</label>
                            <select value={visualStyle} onChange={e => setVisualStyle(e.target.value as StylePresetId)} className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-white text-sm focus:border-emerald-500/50 outline-none">
                                {presets.map(p => (
                                    <option key={p.id} value={p.id}>{p.label}</option>
                                ))}
                            </select>
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">CTA *</label>
                            <input type="text" required value={cta} onChange={e => setCta(e.target.value)} className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-white text-sm focus:border-emerald-500/50 outline-none" placeholder="Ej: Comprá online con envío gratis" />
                        </div>
                        <div className="md:col-span-2">
                            <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Notas adicionales</label>
                            <textarea rows={2} value={additionalNotes} onChange={e => setAdditionalNotes(e.target.value)} className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-white text-sm focus:border-emerald-500/50 outline-none resize-none" />
                        </div>
                    </div>

                    {error && (
                        <div className="text-sm text-red-300 bg-red-500/10 border border-red-500/30 rounded-lg p-3">
                            {error}
                        </div>
                    )}

                    <div className="flex justify-end gap-2 pt-2">
                        <button type="button" onClick={onClose} className="px-4 py-2 rounded-lg text-sm font-bold text-slate-400 hover:text-white">
                            Cancelar
                        </button>
                        <button
                            type="submit"
                            disabled={submitting || !businessName || !product || !category || !audience || !cta}
                            className="px-5 py-2 rounded-lg text-sm font-bold bg-gradient-to-r from-emerald-500 to-cyan-600 text-white shadow-lg hover:brightness-110 disabled:opacity-50"
                        >
                            {submitting ? 'Generando storyboard...' : '✨ Generar Storyboard'}
                        </button>
                    </div>
                </form>
            )}

            {step === 'review' && spec && drafts && (
                <StoryboardReview
                    spec={spec}
                    drafts={drafts}
                    projectId={projectId}
                    onCancel={onClose}
                    onCommitted={(committed) => {
                        onScenesCommitted(committed);
                        onClose();
                    }}
                />
            )}
        </div>
    );
}
