'use client';

import { useEffect, useState, useCallback } from 'react';
import { useUser } from '@clerk/nextjs';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { FaArrowLeft, FaFilm, FaProjectDiagram } from 'react-icons/fa';
import { getProjectStore } from '@/lib/projects/store';
import { getSceneStore } from '@/lib/projects/scenes';
import { Project, Scene } from '@/lib/projects/types';
import { MediaAsset } from '@/lib/storage/indexed-media';
import TimelineEditor from '@/app/dashboard/studio/components/TimelineEditor';
import MediaImportPanel from '@/app/dashboard/studio/components/MediaImportPanel';
import { useToast } from '@/app/dashboard/studio/components/Toast';
import { TimelineClip } from '@/lib/projects/timeline';

export default function TimelinePage() {
    const { user, isLoaded } = useUser();
    const router = useRouter();
    const { showToast } = useToast();
    const [projects, setProjects] = useState<Project[]>([]);
    const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
    const [scenes, setScenes] = useState<Scene[]>([]);
    const [loading, setLoading] = useState(true);
    const [showMediaImport, setShowMediaImport] = useState(false);

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

    const handleAddToTimeline = useCallback((asset: MediaAsset) => {
        if (!selectedProjectId) {
            showToast('error', 'Selecciona un proyecto primero');
            return;
        }
        
        // Create a timeline clip from the media asset
        const clip: TimelineClip = {
            id: `clip_${asset.id}`,
            assetId: asset.id,
            sceneId: undefined, // Media asset, not a scene
            start: 0, // Will be set by reducer
            duration: asset.duration,
            sourceUrl: undefined, // Will be resolved at export/preview time from IndexedDB
            sourceStart: 0,
            sourceEnd: asset.duration,
            type: asset.type,
            title: asset.name,
            transition: 'cut',
        };

        // We need to dispatch ADD_MEDIA_CLIP to the timeline reducer
        // Since we can't directly dispatch from here, we'll use a custom event
        // that the TimelineEditor can listen to, or we can pass a callback
        window.dispatchEvent(new CustomEvent('add-media-to-timeline', { 
            detail: { projectId: selectedProjectId, clip } 
        }));
        
        showToast('success', `Agregado al timeline: ${asset.name}`);
    }, [selectedProjectId, showToast]);

    if (!isLoaded || loading) {
        return <div className="flex h-screen items-center justify-center text-slate-500">Cargando...</div>;
    }

    if (projects.length === 0) {
        return (
            <div className="max-w-2xl mx-auto p-6 text-center">
                <FaProjectDiagram className="w-16 h-16 mx-auto mb-4 text-slate-600" />
                <h2 className="text-2xl font-bold text-white mb-2">No hay proyectos</h2>
                <p className="text-slate-400 mb-6">Crea un proyecto para usar el Timeline Editor.</p>
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
                        <h1 className="text-3xl font-bold tracking-tight">Timeline Editor</h1>
                        <p className="text-slate-400 mt-1">Edición de línea de tiempo multi-pista</p>
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
                    <button
                        onClick={() => setShowMediaImport(!showMediaImport)}
                        className="flex items-center gap-2 px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-sm font-medium border border-white/10"
                    >
                        <FaFilm /> {showMediaImport ? 'Ocultar' : 'Importar'} Media
                    </button>
                </div>
            </header>

            {showMediaImport && selectedProjectId && (
                <div className="mb-6" data-testid="media-import-panel">
                    <MediaImportPanel
                        projectId={selectedProjectId}
                        onAddToTimeline={handleAddToTimeline}
                    />
                </div>
            )}

            {selectedProjectId ? (
                <TimelineEditor
                    projectId={selectedProjectId}
                    scenes={scenes}
                    aspectRatio={projects.find(p => p.id === selectedProjectId)?.format || '9:16'}
                    project={projects.find(p => p.id === selectedProjectId) ?? null}
                />
            ) : (
                <div className="border border-dashed border-white/10 rounded-3xl p-12 text-center bg-slate-900/30">
                    <FaFilm className="w-16 h-16 mx-auto mb-4 text-slate-600" />
                    <h3 className="text-xl font-bold text-white mb-2">Seleccioná un proyecto</h3>
                    <p className="text-slate-400 max-w-md mx-auto">
                        El Timeline Editor requiere un proyecto para cargar las escenas.
                    </p>
                </div>
            )}
        </div>
    );
}