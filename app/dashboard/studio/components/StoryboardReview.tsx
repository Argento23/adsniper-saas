'use client';

import { useState } from 'react';
import { FaCheck, FaTimes, FaEdit } from 'react-icons/fa';
import { CreativeSpec } from '@/lib/creative-director';
import { Scene } from '@/lib/projects/types';
import { getSceneStore, CreateSceneInput } from '@/lib/projects/scenes';

interface StoryboardReviewProps {
    spec: CreativeSpec;
    drafts: Scene[];
    projectId: string;
    onCancel: () => void;
    onCommitted: (scenes: Scene[]) => void;
}

export default function StoryboardReview({ spec, drafts, projectId, onCancel, onCommitted }: StoryboardReviewProps) {
    const [committing, setCommitting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [editedDrafts, setEditedDrafts] = useState<Scene[]>(drafts);

    function updateDraft(idx: number, patch: Partial<Scene>) {
        setEditedDrafts(prev => prev.map((s, i) => (i === idx ? { ...s, ...patch } : s)));
    }

    async function commit() {
        setCommitting(true);
        setError(null);
        try {
            const sceneStore = getSceneStore();
            const created: Scene[] = [];
            for (const scene of editedDrafts) {
                const input: CreateSceneInput = {
                    projectId,
                    order: scene.order,
                    visualPrompt: scene.visualPrompt,
                    durationSec: scene.durationSec,
                };
                if (scene.title) input.title = scene.title;
                if (scene.description) input.description = scene.description;
                if (scene.prompt) input.prompt = scene.prompt;
                if (scene.negativePrompt) input.negativePrompt = scene.negativePrompt;
                if (scene.camera) input.camera = scene.camera;
                if (scene.voiceover) input.voiceover = scene.voiceover;
                if (scene.onScreenText) input.onScreenText = scene.onScreenText;
                if (scene.transitionIn) input.transitionIn = scene.transitionIn;
                if (scene.aspectRatio) input.aspectRatio = scene.aspectRatio;
                const createdScene = sceneStore.createScene(input);
                created.push(createdScene);
            }
            onCommitted(created);
        } catch (e: unknown) {
            setError(e instanceof Error ? e.message : 'failed');
        } finally {
            setCommitting(false);
        }
    }

    return (
        <div className="space-y-5">
            <div className="text-xs text-slate-400">Paso 2 de 2 · Storyboard editable</div>

            <div className="bg-slate-950/60 border border-white/10 rounded-xl p-4 space-y-2">
                <div className="flex items-center justify-between">
                    <h4 className="text-base font-bold text-white">{spec.campaignTitle}</h4>
                    <span className="text-[10px] uppercase tracking-wider text-slate-500 font-bold">{spec.scenes.length} escenas</span>
                </div>
                <p className="text-sm text-emerald-300"><strong>Concepto:</strong> {spec.concept}</p>
                <p className="text-sm text-amber-300"><strong>Hook:</strong> {spec.hook}</p>
                <p className="text-sm text-slate-300">{spec.narrative}</p>
                <div className="text-xs text-slate-500 pt-2 border-t border-white/5">
                    <strong className="text-slate-300">Caption:</strong> {spec.caption}
                </div>
                {spec.hashtags.length > 0 && (
                    <div className="text-xs text-cyan-300">{spec.hashtags.map(h => `#${h}`).join(' ')}</div>
                )}
            </div>

            <div className="space-y-3 max-h-[420px] overflow-y-auto pr-1">
                {editedDrafts.map((s, idx) => (
                    <div key={idx} className="bg-slate-950/60 border border-white/10 rounded-xl p-4 space-y-2">
                        <div className="flex items-center justify-between">
                            <div>
                                <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-slate-800 text-slate-300">
                                    Escena {idx + 1} · {s.durationSec}s · {s.transitionIn}
                                </span>
                            </div>
                            <FaEdit className="text-slate-500 w-3 h-3" />
                        </div>
                        <input
                            type="text"
                            value={s.title ?? ''}
                            onChange={e => updateDraft(idx, { title: e.target.value })}
                            className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-white text-sm focus:border-emerald-500/50 outline-none"
                        />
                        <textarea
                            rows={2}
                            value={s.onScreenText ?? ''}
                            onChange={e => updateDraft(idx, { onScreenText: e.target.value })}
                            placeholder="Texto en pantalla"
                            className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-white text-xs focus:border-emerald-500/50 outline-none resize-none"
                        />
                        <textarea
                            rows={2}
                            value={s.voiceover ?? ''}
                            onChange={e => updateDraft(idx, { voiceover: e.target.value })}
                            placeholder="Voz en off"
                            className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-white text-xs focus:border-emerald-500/50 outline-none resize-none"
                        />
                        <details className="text-xs text-slate-400">
                            <summary className="cursor-pointer hover:text-slate-300">Prompt visual</summary>
                            <p className="mt-2 text-slate-500 leading-relaxed">{s.visualPrompt}</p>
                        </details>
                    </div>
                ))}
            </div>

            {error && (
                <div className="text-sm text-red-300 bg-red-500/10 border border-red-500/30 rounded-lg p-3">
                    {error}
                </div>
            )}

            <div className="flex justify-end gap-2 pt-2 border-t border-white/5">
                <button onClick={onCancel} className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-bold text-slate-400 hover:text-white">
                    <FaTimes className="w-3 h-3" /> Cancelar
                </button>
                <button
                    onClick={commit}
                    disabled={committing}
                    className="flex items-center gap-1.5 px-5 py-2 rounded-lg text-sm font-bold bg-gradient-to-r from-emerald-500 to-cyan-600 text-white shadow-lg hover:brightness-110 disabled:opacity-50"
                >
                    <FaCheck className="w-3 h-3" />
                    {committing ? 'Creando escenas...' : 'Aprobar y crear escenas'}
                </button>
            </div>
        </div>
    );
}
