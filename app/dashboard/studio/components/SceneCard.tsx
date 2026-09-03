'use client';

import { useState } from 'react';
import { FaImage, FaVideo, FaTrash, FaSpinner, FaCheck, FaClock } from 'react-icons/fa';
import { Scene } from '@/lib/projects/types';

interface SceneCardProps {
    scene: Scene;
    projectId: string;
    onDelete: (sceneId: string) => void;
    onUpdated: (scene: Scene) => void;
}

function statusBadge(status: Scene['status']): { label: string; className: string } {
    switch (status) {
        case 'pending': return { label: 'Pendiente', className: 'bg-slate-800 text-slate-400' };
        case 'prompt_ready': return { label: 'Prompt listo', className: 'bg-slate-700 text-slate-200' };
        case 'generating_keyframe': return { label: 'Generando keyframe', className: 'bg-amber-500/20 text-amber-300 border border-amber-500/30' };
        case 'keyframe_ready': return { label: 'Keyframe listo', className: 'bg-blue-500/20 text-blue-300 border border-blue-500/30' };
        case 'generating_video': return { label: 'Generando video', className: 'bg-purple-500/20 text-purple-300 border border-purple-500/30' };
        case 'video_ready': return { label: 'Video listo', className: 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30' };
        case 'ready': return { label: 'Listo', className: 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30' };
        case 'failed': return { label: 'Falló', className: 'bg-red-500/20 text-red-300 border border-red-500/30' };
        default: return { label: status, className: 'bg-slate-800 text-slate-400' };
    }
}

export default function SceneCard({ scene, projectId, onDelete, onUpdated }: SceneCardProps) {
    const [busyKeyframe, setBusyKeyframe] = useState(false);
    const [busyVideo, setBusyVideo] = useState(false);
    const [lastKeyframeUrl, setLastKeyframeUrl] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);

    async function generateKeyframe() {
        setBusyKeyframe(true);
        setError(null);
        try {
            const res = await fetch(`/api/studio/projects/${projectId}/scenes/${scene.id}/keyframe`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({}),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
            setLastKeyframeUrl(data.keyframe?.url ?? null);
            onUpdated({ ...scene, status: 'keyframe_ready', keyframeAssetId: data.keyframe?.assetId });
        } catch (e: unknown) {
            setError(e instanceof Error ? e.message : 'failed');
        } finally {
            setBusyKeyframe(false);
        }
    }

    async function generateVideo() {
        setBusyVideo(true);
        setError(null);
        try {
            // For MVP we forward the keyframe URL returned by the previous call
            // (kept in component state). When asset persistence arrives, this
            // will be resolved server-side from `keyframeAssetId`.
            const res = await fetch(`/api/studio/projects/${projectId}/scenes/${scene.id}/video`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(lastKeyframeUrl ? { imageUrl: lastKeyframeUrl } : {}),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
            onUpdated({
                ...scene,
                status: 'generating_video',
                videoAssetId: data.assetId,
                videoProviderId: data.provider,
            });
        } catch (e: unknown) {
            setError(e instanceof Error ? e.message : 'failed');
        } finally {
            setBusyVideo(false);
        }
    }

    const badge = statusBadge(scene.status);
    const isGenerating = busyKeyframe || busyVideo || scene.status.startsWith('generating_');
    const hasKeyframe = !!scene.keyframeAssetId || !!lastKeyframeUrl;

    return (
        <div className="bg-slate-900/60 border border-white/10 rounded-2xl overflow-hidden hover:border-emerald-500/30 transition-all">
            <div className="aspect-video bg-gradient-to-br from-slate-800 to-slate-900 relative flex items-center justify-center">
                {lastKeyframeUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={lastKeyframeUrl} alt="Keyframe" className="w-full h-full object-cover" />
                ) : (
                    <FaImage className="w-10 h-10 text-slate-700" />
                )}
                <span className={`absolute top-3 left-3 text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded ${badge.className}`}>
                    {badge.label}
                </span>
                <span className="absolute top-3 right-3 text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-black/50 text-slate-300 backdrop-blur-md border border-white/10">
                    #{scene.order + 1} · {scene.durationSec}s
                </span>
            </div>

            <div className="p-5 space-y-3">
                <div>
                    <h3 className="text-base font-bold text-white truncate" title={scene.title ?? scene.visualPrompt}>
                        {scene.title ?? `Escena ${scene.order + 1}`}
                    </h3>
                    <p className="text-xs text-slate-400 line-clamp-2 mt-1">{scene.visualPrompt}</p>
                    {scene.camera && (
                        <p className="text-[10px] text-slate-500 mt-1 flex items-center gap-1">
                            <FaClock className="w-2.5 h-2.5" /> Cámara: {scene.camera}
                        </p>
                    )}
                </div>

                {error && (
                    <div className="text-xs text-red-300 bg-red-500/10 border border-red-500/30 rounded-lg p-2">
                        {error}
                    </div>
                )}

                <div className="flex flex-wrap gap-2 pt-2 border-t border-white/5">
                    <button
                        onClick={generateKeyframe}
                        disabled={isGenerating}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-slate-800 text-slate-300 hover:bg-slate-700 disabled:opacity-50"
                    >
                        {busyKeyframe ? <FaSpinner className="animate-spin w-3 h-3" /> : (hasKeyframe ? <FaCheck className="w-3 h-3 text-emerald-400" /> : <FaImage className="w-3 h-3" />)}
                        {busyKeyframe ? 'Generando...' : (hasKeyframe ? 'Regenerar keyframe' : 'Generar keyframe')}
                    </button>
                    <button
                        onClick={generateVideo}
                        disabled={isGenerating || !hasKeyframe}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-purple-600 text-white hover:bg-purple-500 disabled:opacity-50"
                    >
                        {busyVideo ? <FaSpinner className="animate-spin w-3 h-3" /> : <FaVideo className="w-3 h-3" />}
                        {busyVideo ? 'Generando...' : (scene.videoAssetId ? 'Regenerar video' : 'Generar video')}
                    </button>
                    <button
                        onClick={() => onDelete(scene.id)}
                        disabled={isGenerating}
                        className="ml-auto text-slate-500 hover:text-red-400 p-1.5 disabled:opacity-50"
                        title="Eliminar escena"
                    >
                        <FaTrash className="w-3 h-3" />
                    </button>
                </div>
            </div>
        </div>
    );
}
