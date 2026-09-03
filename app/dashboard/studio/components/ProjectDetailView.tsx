'use client';

import { useEffect, useState } from 'react';
import { useUser } from '@clerk/nextjs';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { FaArrowLeft, FaPlus, FaTrash, FaImage, FaVideo, FaSpinner, FaMagic, FaFilm } from 'react-icons/fa';
import { Scene } from '@/lib/projects/types';
import SceneCard from './SceneCard';
import NewSceneForm from './NewSceneForm';
import CreativeDirectorWizard from './CreativeDirectorWizard';
import TimelineEditor from './TimelineEditor';

export default function ProjectDetailView() {
    const { user, isLoaded } = useUser();
    const router = useRouter();
    const params = useParams<{ projectId: string }>();
    const projectId = params.projectId;

    const [scenes, setScenes] = useState<Scene[]>([]);
    const [projectName, setProjectName] = useState<string>('');
    const [format, setFormat] = useState<string>('9:16');
    const [loading, setLoading] = useState(true);
    const [showNew, setShowNew] = useState(false);
    const [showDirector, setShowDirector] = useState(false);
    const [showTimeline, setShowTimeline] = useState(true);
    const [error, setError] = useState<string | null>(null);

    async function load() {
        if (!projectId) return;
        setLoading(true);
        setError(null);
        try {
            const res = await fetch(`/api/studio/projects/${projectId}/scenes`);
            if (!res.ok) {
                const data = await res.json().catch(() => ({}));
                throw new Error(data.error || `HTTP ${res.status}`);
            }
            const data = await res.json();
            setScenes(data.scenes ?? []);
        } catch (e: unknown) {
            setError(e instanceof Error ? e.message : 'failed to load');
        } finally {
            setLoading(false);
        }
    }

    useEffect(() => {
        if (isLoaded && user && projectId) {
            load();
            try {
                const raw = window.localStorage.getItem('AdSíntesisStudio.projects');
                if (raw) {
                    const map = JSON.parse(raw) as Record<string, { name: string; format?: string }[]>;
                    const list = map[user.id] ?? [];
                    const p = list.find(x => x && typeof x.name === 'string');
                    if (p) {
                        setProjectName(p.name);
                        if (typeof p.format === 'string') setFormat(p.format);
                    }
                }
            } catch {
                /* ignore */
            }
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isLoaded, user, projectId]);

    async function handleDelete(sceneId: string) {
        if (!confirm('¿Eliminar esta escena?')) return;
        const res = await fetch(`/api/studio/projects/${projectId}/scenes/${sceneId}`, {
            method: 'DELETE',
        });
        if (res.ok) setScenes(prev => prev.filter(s => s.id !== sceneId));
    }

    function handleCreated(scene: Scene) {
        setScenes(prev => [...prev, scene]);
        setShowNew(false);
    }

    function handleScenesCommitted(committed: Scene[]) {
        setScenes(prev => [...prev, ...committed]);
        setShowDirector(false);
    }

    function handleSceneUpdated(scene: Scene) {
        setScenes(prev => prev.map(s => (s.id === scene.id ? scene : s)));
    }

    if (!isLoaded) {
        return <div className="text-slate-500">Cargando...</div>;
    }

    return (
        <div className="space-y-8 max-w-5xl">
            <div className="flex items-center justify-between gap-4 flex-wrap">
                <div className="flex items-center gap-3">
                    <Link
                        href="/dashboard/studio"
                        className="text-slate-400 hover:text-white p-2 rounded-lg border border-white/10 hover:border-white/20 transition-colors"
                        title="Volver"
                    >
                        <FaArrowLeft />
                    </Link>
                    <div>
                        <h1 className="text-2xl md:text-3xl font-bold tracking-tight">
                            {projectName || 'Proyecto'}
                        </h1>
                        <p className="text-xs text-slate-500 font-mono">{projectId}</p>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    <button
                        onClick={() => setShowDirector(true)}
                        className="flex items-center gap-2 px-4 py-2 rounded-xl bg-gradient-to-r from-purple-500 to-indigo-600 text-white text-sm font-bold shadow-lg hover:brightness-110 transition-all border border-purple-400/30"
                    >
                        <FaMagic className="w-3 h-3" /> ✨ Creative Director
                    </button>
                    <button
                        onClick={() => setShowNew(true)}
                        className="flex items-center gap-2 px-4 py-2 rounded-xl bg-gradient-to-r from-emerald-500 to-cyan-600 text-white text-sm font-bold shadow-lg hover:brightness-110 transition-all"
                    >
                        <FaPlus className="w-3 h-3" /> Nueva escena
                    </button>
                </div>
            </div>

            {error && (
                <div className="bg-red-500/10 border border-red-500/30 text-red-300 rounded-xl p-4 text-sm">
                    {error}
                </div>
            )}

            {showDirector && (
                <CreativeDirectorWizard
                    projectId={projectId}
                    onClose={() => setShowDirector(false)}
                    onScenesCommitted={handleScenesCommitted}
                />
            )}

            {showNew && (
                <NewSceneForm
                    projectId={projectId}
                    nextOrder={scenes.length}
                    onCancel={() => setShowNew(false)}
                    onCreated={handleCreated}
                />
            )}

            {loading ? (
                <div className="text-center py-16 text-slate-500">
                    <FaSpinner className="w-6 h-6 mx-auto mb-3 animate-spin" />
                    Cargando escenas...
                </div>
            ) : scenes.length === 0 ? (
                <div className="border border-dashed border-white/10 rounded-3xl p-12 text-center bg-slate-900/30">
                    <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-gradient-to-br from-purple-500/20 to-indigo-500/20 flex items-center justify-center border border-white/10">
                        <FaMagic className="w-7 h-7 text-purple-400" />
                    </div>
                    <h3 className="text-xl font-bold text-white mb-2">Empezá con un brief</h3>
                    <p className="text-slate-400 mb-6 max-w-md mx-auto">
                        Contanos qué querés comunicar y el Creative Director IA generará un storyboard editable con 4–8 escenas listas para producir.
                    </p>
                    {!showDirector && (
                        <button
                            onClick={() => setShowDirector(true)}
                            className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-gradient-to-r from-purple-500 to-indigo-600 text-white font-bold shadow-lg hover:brightness-110 transition-all"
                        >
                            <FaMagic className="w-4 h-4" /> ✨ Abrir Creative Director
                        </button>
                    )}
                </div>
            ) : (
                <>
                    {showTimeline && (
                        <TimelineEditor
                            projectId={projectId}
                            scenes={scenes}
                            aspectRatio={format}
                            onClose={() => setShowTimeline(false)}
                        />
                    )}
                    {!showTimeline && (
                        <button
                            onClick={() => setShowTimeline(true)}
                            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-900/60 border border-white/10 text-slate-300 text-sm hover:text-white hover:border-white/20 transition-all"
                        >
                            <FaFilm /> Abrir Timeline Editor
                       </button>
                    )}
                    <div className="grid sm:grid-cols-2 gap-5">
                        {scenes.map(s => (
                            <SceneCard
                                key={s.id}
                                scene={s}
                                projectId={projectId}
                                onDelete={handleDelete}
                                onUpdated={handleSceneUpdated}
                            />
                        ))}
                   </div>
                </>
            )}
       </div>
    );
}
