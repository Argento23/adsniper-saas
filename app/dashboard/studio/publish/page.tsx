'use client';

import { useEffect, useState } from 'react';
import { useUser } from '@clerk/nextjs';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { FaArrowLeft, FaPaperPlane, FaProjectDiagram, FaShare, FaCheckCircle } from 'react-icons/fa';
import { getProjectStore } from '@/lib/projects/store';
import { getSceneStore } from '@/lib/projects/scenes';
import { Project, Scene } from '@/lib/projects/types';
import PublishScreen from '@/app/dashboard/studio/components/PublishScreen';

export default function PublishPage() {
    const { user, isLoaded } = useUser();
    const router = useRouter();
    const [projects, setProjects] = useState<Project[]>([]);
    const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
    const [scenes, setScenes] = useState<Scene[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!isLoaded || !user) return;
        const store = getProjectStore();
        const projectList = store.listProjects(user.id);
        setProjects(projectList);
        if (projectList.length > 0) {
            setSelectedProjectId(projectList[0].id);
        }
        setLoading(false);
    }, [isLoaded, user]);

    useEffect(() => {
        if (!selectedProjectId) return;
        const sceneStore = getSceneStore();
        const projectScenes = sceneStore.listScenes(selectedProjectId);
        setScenes(projectScenes);
    }, [selectedProjectId]);

    const readyScenes = scenes.filter(s => s.videoAssetId);

    if (!isLoaded || loading) {
        return <div className="flex h-screen items-center justify-center text-slate-500">Cargando...</div>;
    }

    if (projects.length === 0) {
        return (
            <div className="max-w-2xl mx-auto p-6 text-center">
                <FaProjectDiagram className="w-16 h-16 mx-auto mb-4 text-slate-600" />
                <h2 className="text-2xl font-bold text-white mb-2">No hay proyectos</h2>
                <p className="text-slate-400 mb-6">Crea un proyecto para publicar.</p>
                <Link
                    href="/dashboard/studio"
                    className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-gradient-to-r from-emerald-500 to-cyan-600 text-white font-bold shadow-lg hover:brightness-110"
                >
                    <FaArrowLeft /> Volver a Proyectos
                </Link>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-slate-950 text-slate-100">
            <header className="sticky top-0 z-30 border-b border-white/5 bg-slate-950/95 backdrop-blur-md">
                <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-3">
                    <div className="flex items-center gap-3">
                        <Link
                            href="/dashboard/studio"
                            className="rounded-[10px] p-2 text-slate-400 hover:bg-white/5 hover:text-white transition"
                        >
                            <FaArrowLeft className="h-4 w-4" />
                        </Link>
                        <div>
                            <p className="text-[10px] uppercase tracking-widest text-slate-500">Publicar</p>
                            <h1 className="text-sm font-semibold text-white">Adsíntesis · Studio Marketing</h1>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        <div className="flex items-center gap-2 rounded-[10px] border border-white/10 bg-white/[0.03] px-3 py-1.5">
                            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                            <span className="text-[11px] text-slate-300">
                                {selectedProjectId ? projects.find(p => p.id === selectedProjectId)?.name : 'Sin proyecto'}
                            </span>
                        </div>
                        <select
                            value={selectedProjectId || ''}
                            onChange={e => setSelectedProjectId(e.target.value || null)}
                            className="rounded-[10px] border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-medium text-slate-300 hover:bg-white/10 transition"
                        >
                            <option value="">Seleccionar proyecto...</option>
                            {projects.map(p => (
                                <option key={p.id} value={p.id}>{p.name}</option>
                            ))}
                        </select>
                    </div>
                </div>
            </header>

            {selectedProjectId ? (
                <PublishScreen />
            ) : (
                <div className="mx-auto max-w-7xl px-6 py-12">
                    <div className="border border-dashed border-white/10 rounded-3xl p-12 text-center bg-slate-900/30">
                        <FaShare className="w-16 h-16 mx-auto mb-4 text-slate-600" />
                        <h3 className="text-xl font-bold text-white mb-2">Seleccioná un proyecto</h3>
                        <p className="text-slate-400 max-w-md mx-auto">
                            La publicación requiere un proyecto seleccionado.
                        </p>
                    </div>
                </div>
            )}
        </div>
    );
}