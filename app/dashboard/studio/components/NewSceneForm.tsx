'use client';

import { useState } from 'react';
import { FaTimes } from 'react-icons/fa';
import { Scene, AspectRatio } from '@/lib/projects/types';
import { getSceneStore, CreateSceneInput } from '@/lib/projects/scenes';

interface NewSceneFormProps {
    projectId: string;
    nextOrder: number;
    onCancel: () => void;
    onCreated: (scene: Scene) => void;
}

export default function NewSceneForm({ projectId, nextOrder, onCancel, onCreated }: NewSceneFormProps) {
    const [title, setTitle] = useState('');
    const [visualPrompt, setVisualPrompt] = useState('');
    const [camera, setCamera] = useState('');
    const [durationSec, setDurationSec] = useState(5);
    const [aspectRatio, setAspectRatio] = useState<AspectRatio>('9:16');
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        setSubmitting(true);
        setError(null);
        try {
            const sceneStore = getSceneStore();
            const input: CreateSceneInput = {
                projectId,
                order: nextOrder,
                visualPrompt: visualPrompt.trim(),
                durationSec,
            };
            if (title.trim()) input.title = title.trim();
            if (camera.trim()) input.camera = camera.trim();
            input.aspectRatio = aspectRatio;
            const scene = sceneStore.createScene(input);
            onCreated(scene);
        } catch (e: unknown) {
            setError(e instanceof Error ? e.message : 'failed');
        } finally {
            setSubmitting(false);
        }
    }

    return (
        <form onSubmit={handleSubmit} className="bg-slate-900/60 border border-white/10 rounded-2xl p-6 space-y-4 backdrop-blur-xl">
            <div className="flex items-center justify-between">
                <h3 className="text-lg font-bold text-white">Nueva escena</h3>
                <button type="button" onClick={onCancel} className="text-slate-500 hover:text-white">
                    <FaTimes />
                </button>
            </div>

            <div className="grid md:grid-cols-2 gap-4">
                <div>
                    <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Título (opcional)</label>
                    <input
                        type="text"
                        value={title}
                        onChange={e => setTitle(e.target.value)}
                        placeholder="Ej: Hero shot del producto"
                        className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-white focus:border-emerald-500/50 outline-none text-sm"
                    />
                </div>
                <div>
                    <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Duración (s)</label>
                    <input
                        type="number"
                        min={1}
                        max={60}
                        value={durationSec}
                        onChange={e => setDurationSec(Number(e.target.value) || 5)}
                        className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-white focus:border-emerald-500/50 outline-none text-sm"
                    />
                </div>
            </div>

            <div>
                <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Prompt visual *</label>
                <textarea
                    value={visualPrompt}
                    onChange={e => setVisualPrompt(e.target.value)}
                    placeholder="Describe la escena: producto, iluminación, movimiento de cámara, ambiente..."
                    rows={3}
                    required
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-white focus:border-emerald-500/50 outline-none text-sm resize-none"
                />
            </div>

            <div className="grid md:grid-cols-2 gap-4">
                <div>
                    <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Cámara (opcional)</label>
                    <input
                        type="text"
                        value={camera}
                        onChange={e => setCamera(e.target.value)}
                        placeholder="Ej: slow motion, gimbal travelling"
                        className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-white focus:border-emerald-500/50 outline-none text-sm"
                    />
                </div>
                <div>
                    <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Aspect ratio</label>
                    <select
                        value={aspectRatio}
                        onChange={e => setAspectRatio(e.target.value as AspectRatio)}
                        className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-white focus:border-emerald-500/50 outline-none text-sm"
                    >
                        <option value="9:16">9:16</option>
                        <option value="1:1">1:1</option>
                        <option value="4:5">4:5</option>
                        <option value="16:9">16:9</option>
                    </select>
                </div>
            </div>

            {error && <div className="text-sm text-red-300 bg-red-500/10 border border-red-500/30 rounded-lg p-3">{error}</div>}

            <div className="flex justify-end gap-2">
                <button type="button" onClick={onCancel} className="px-4 py-2 rounded-lg text-sm font-bold text-slate-400 hover:text-white">
                    Cancelar
                </button>
                <button
                    type="submit"
                    disabled={submitting || !visualPrompt.trim()}
                    className="px-5 py-2 rounded-lg text-sm font-bold bg-gradient-to-r from-emerald-500 to-cyan-600 text-white shadow-lg hover:brightness-110 disabled:opacity-50"
                >
                    {submitting ? 'Creando...' : 'Crear escena'}
                </button>
            </div>
        </form>
    );
}
