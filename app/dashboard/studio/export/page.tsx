'use client';

import { useEffect, useState } from 'react';
import { useUser } from '@clerk/nextjs';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { FaArrowLeft, FaDownload, FaFilm, FaProjectDiagram, FaCheckCircle, FaClock, FaExclamationTriangle } from 'react-icons/fa';
import { getProjectStore } from '@/lib/projects/store';
import { getSceneStore } from '@/lib/projects/scenes';
import { getTimelineStore } from '@/lib/projects/timeline-store';
import { Project, Scene, Timeline } from '@/lib/projects/types';
import ExportModal from '@/app/dashboard/studio/components/ExportModal';

export default function ExportPage() {
    const { user, isLoaded } = useUser();
    const router = useRouter();
    const [projects, setProjects] = useState<Project[]>([]);
    const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
    const [scenes, setScenes] = useState<Scene[]>([]);
    const [timeline, setTimeline] = useState<Timeline | null>(null);
    const [loading, setLoading] = useState(true);
    const [modalOpen, setModalOpen] = useState(false);
    const [exporting, setExporting] = useState(false);
    const [exportProgress, setExportProgress] = useState(0);

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
        const timelineStore = getTimelineStore();
        const projectScenes = sceneStore.listScenes(selectedProjectId);
        const projectTimeline = timelineStore.getTimeline(selectedProjectId);
        setScenes(projectScenes);
        setTimeline(projectTimeline);
    }, [selectedProjectId]);

    const handleExport = async () => {
        if (!selectedProjectId || !timeline) return;
        setExporting(true);
        setExportProgress(0);
        setModalOpen(false);

        // Simulate export progress
        const interval = setInterval(() => {
            setExportProgress(p => {
                if (p >= 90) {
                    clearInterval(interval);
                    return 90;
                }
                return p + 10;
            });
        }, 500);

        try {
            // Call the actual export API with project, timeline, and scenes
            const projectStore = getProjectStore();
            const project = projectStore.getProject(user.id, selectedProjectId);
            if (!project) {
                throw new Error('Proyecto no encontrado en localStorage');
            }

            const res = await fetch(`/api/studio/projects/${selectedProjectId}/export`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    project: {
                        id: project.id,
                        userId: project.userId,
                        name: project.name,
                        format: project.format,
                    },
                    timeline,
                    scenes,
                })
            });
            const data = await res.json();
            clearInterval(interval);
            setExportProgress(100);
            if (res.ok && data.jobId) {
                // Poll for completion
                pollExport(selectedProjectId, data.jobId, project.userId);
            } else {
                alert(data.error || 'Error al iniciar exportación');
                setExporting(false);
            }
        } catch (err) {
            clearInterval(interval);
            alert(err instanceof Error ? err.message : 'Error de conexión');
            setExporting(false);
        }
    };

    const pollExport = async (projectId: string, jobId: string, projectUserId: string) => {
        const interval = setInterval(async () => {
            try {
                const res = await fetch(`/api/studio/projects/${projectId}/export/${jobId}?projectUserId=${projectUserId}`);
                const data = await res.json();
                if (data.status === 'completed') {
                    clearInterval(interval);
                    setExporting(false);
                    setExportProgress(0);
                    alert(`Exportación completada: ${data.url}`);
                } else if (data.status === 'failed') {
                    clearInterval(interval);
                    setExporting(false);
                    setExportProgress(0);
                    alert(`Exportación fallida: ${data.error}`);
                }
            } catch {
                clearInterval(interval);
                setExporting(false);
                setExportProgress(0);
            }
        }, 2000);
    };

    if (!isLoaded || loading) {
        return <div className="flex h-screen items-center justify-center text-slate-500">Cargando...</div>;
    }

    if (projects.length === 0) {
        return (
            <div className="max-w-2xl mx-auto p-6 text-center">
                <FaProjectDiagram className="w-16 h-16 mx-auto mb-4 text-slate-600" />
                <h2 className="text-2xl font-bold text-white mb-2">No hay proyectos</h2>
                <p className="text-slate-400 mb-6">Crea un proyecto para exportar.</p>
                <Link
                    href="/dashboard/studio"
                    className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-gradient-to-r from-emerald-500 to-cyan-600 text-white font-bold shadow-lg hover:brightness-110"
                >
                    <FaArrowLeft /> Volver a Proyectos
                </Link>
            </div>
        );
    }

    const selectedProject = projects.find(p => p.id === selectedProjectId);
    const readyScenes = scenes.filter(s => s.videoAssetId).length;

    return (
        <div className="max-w-7xl mx-auto p-6">
            <header className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                    <Link
                        href="/dashboard/studio"
                        className="text-slate-400 hover:text-white p-2 rounded-lg border border-white/10 hover:border-white/20 transition-colors"
                    >
                        <FaArrowLeft />
                    </Link>
                    <div>
                        <h1 className="text-3xl font-bold tracking-tight">Exportaciones</h1>
                        <p className="text-slate-400 mt-1">Generá el MP4 final de tu proyecto</p>
                    </div>
                </div>
                <div className="flex items-center gap-4">
                    <select
                        value={selectedProjectId || ''}
                        onChange={e => setSelectedProjectId(e.target.value || null)}
                        className="bg-slate-900/60 border border-white/10 rounded-xl px-4 py-2 text-white focus:border-emerald-500/50 outline-none"
                    >
                        <option value="">Seleccionar proyecto...</option>
                        {projects.map(p => (
                            <option key={p.id} value={p.id}>{p.name}</option>
                        ))}
                    </select>
                </div>
            </header>

            {selectedProject ? (
                <div className="grid lg:grid-cols-3 gap-6">
                    <div className="lg:col-span-2 space-y-6">
                        <div className="bg-slate-900/60 border border-white/10 rounded-2xl p-6">
                            <h2 className="text-xl font-bold mb-4">Configuración de Exportación</h2>
                            <div className="space-y-4">
                                <div>
                                    <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Proyecto</label>
                                    <p className="text-white">{selectedProject.name}</p>
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Escenas con video</label>
                                    <p className="text-white">{readyScenes} de {scenes.length}</p>
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Duración total estimada</label>
                                    <p className="text-white">{scenes.reduce((acc, s) => acc + s.durationSec, 0)}s</p>
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Formato</label>
                                    <p className="text-white">{selectedProject.format}</p>
                                </div>
                            </div>
                        </div>

                        {readyScenes === 0 ? (
                            <div className="border border-dashed border-amber-500/30 rounded-2xl p-6 bg-amber-500/5">
                                <div className="flex items-center gap-3">
                                    <FaExclamationTriangle className="w-6 h-6 text-amber-500" />
                                    <div>
                                        <p className="font-bold text-amber-400">No hay escenas con video</p>
                                        <p className="text-sm text-amber-500">Generá videos para las escenas antes de exportar.</p>
                                    </div>
                                </div>
                            </div>
                        ) : (
                            <button
                                onClick={() => setModalOpen(true)}
                                disabled={exporting}
                                className="w-full flex items-center justify-center gap-2 px-6 py-4 rounded-xl bg-gradient-to-r from-emerald-500 to-cyan-600 text-white font-bold shadow-lg hover:brightness-110 disabled:opacity-50 transition-all"
                            >
                                <FaDownload className="w-5 h-5" />
                                {exporting ? (
                                    <>
                                        <FaSpinner className="w-5 h-5 animate-spin" />
                                        Exportando... {exportProgress}%
                                    </>
                                ) : 'Abrir Configuración y Exportar'}
                            </button>
                        )}
                    </div>

                    <div className="space-y-4">
                        <div className="bg-slate-900/60 border border-white/10 rounded-2xl p-6">
                            <h3 className="font-bold mb-4">Escenas del proyecto</h3>
                            <div className="space-y-2 max-h-96 overflow-y-auto">
                                {scenes.map((scene, index) => (
                                    <div
                                        key={scene.id}
                                        className="flex items-center gap-3 p-3 rounded-lg bg-slate-950 border border-white/5"
                                    >
                                        <span className="w-6 text-center text-slate-500">{index + 1}</span>
                                        <div className="flex-1 min-w-0">
                                            <p className="text-sm font-medium text-white truncate">{scene.title || 'Sin título'}</p>
                                            <p className="text-[11px] text-slate-500 truncate">{scene.visualPrompt.slice(0, 60)}</p>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            {scene.videoAssetId ? (
                                                <FaCheckCircle className="w-4 h-4 text-emerald-400" title="Video listo" />
                                            ) : (
                                                <FaClock className="w-4 h-4 text-amber-400" title="Sin video" />
                                            )}
                                            <span className="text-[10px] text-slate-500">{scene.durationSec}s</span>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>
            ) : (
                <div className="border border-dashed border-white/10 rounded-3xl p-12 text-center bg-slate-900/30">
                    <FaFilm className="w-16 h-16 mx-auto mb-4 text-slate-600" />
                    <h3 className="text-xl font-bold text-white mb-2">Seleccioná un proyecto</h3>
                    <p className="text-slate-400 max-w-md mx-auto">
                        La exportación requiere un proyecto con escenas renderizadas.
                    </p>
                </div>
            )}

            <ExportModal open={modalOpen} onClose={() => setModalOpen(false)} />
        </div>
    );
}