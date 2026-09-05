'use client';

import { useEffect, useState } from 'react';
import { useUser } from '@clerk/nextjs';
import { FaImage, FaVideo, FaFilm, FaSearch, FaFilter, FaTimes } from 'react-icons/fa';
import { getProjectStore } from '@/lib/projects/store';
import { getSceneStore } from '@/lib/projects/scenes';
import { Project, Scene } from '@/lib/projects/types';

export default function AssetsPage() {
    const { user, isLoaded } = useUser();
    const [allScenes, setAllScenes] = useState<Scene[]>([]);
    const [filteredScenes, setFilteredScenes] = useState<Scene[]>([]);
    const [search, setSearch] = useState('');
    const [filterType, setFilterType] = useState<'all' | 'image' | 'video'>('all');
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!isLoaded || !user) return;

        const projectStore = getProjectStore();
        const sceneStore = getSceneStore();
        const projects = projectStore.listProjects(user.id);

        const scenes: Scene[] = [];
        for (const project of projects) {
            const projectScenes = sceneStore.listScenes(project.id);
            scenes.push(...projectScenes.map(s => ({ ...s, projectName: project.name, projectId: project.id } as Scene & { projectName: string; projectId: string })));
        }

        setAllScenes(scenes);
        setFilteredScenes(scenes);
        setLoading(false);
    }, [isLoaded, user]);

    useEffect(() => {
        let result = allScenes;
        if (search) {
            const q = search.toLowerCase();
            result = result.filter(s =>
                s.visualPrompt.toLowerCase().includes(q) ||
                (s.title?.toLowerCase().includes(q) ?? false) ||
                (s.projectName?.toLowerCase().includes(q) ?? false)
            );
        }
        if (filterType !== 'all') {
            result = result.filter(s => filterType === 'video' ? s.videoAssetId : !s.videoAssetId);
        }
        setFilteredScenes(result);
    }, [allScenes, search, filterType]);

    if (!isLoaded) {
        return <div className="flex h-screen items-center justify-center text-slate-500">Cargando...</div>;
    }

    return (
        <div className="space-y-6 max-w-7xl mx-auto p-6">
            <header className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">Assets</h1>
                    <p className="text-slate-400 mt-1">Gestioná tus imágenes y videos generados</p>
                </div>
            </header>

            <div className="bg-slate-900/60 border border-white/10 rounded-2xl p-4">
                <div className="flex flex-col sm:flex-row gap-4">
                    <div className="relative flex-1">
                        <FaSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                        <input
                            type="text"
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                            placeholder="Buscar por prompt, título o proyecto..."
                            className="w-full pl-10 pr-4 py-2 bg-slate-950 border border-slate-800 rounded-xl text-white placeholder-slate-500 focus:border-emerald-500/50 outline-none"
                        />
                    </div>
                    <div className="flex gap-2">
                        {(['all', 'image', 'video'] as const).map(type => (
                            <button
                                key={type}
                                onClick={() => setFilterType(type)}
                                className={`px-4 py-2 rounded-xl text-sm font-medium transition ${
                                    filterType === type
                                        ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                                        : 'bg-slate-950 text-slate-400 hover:text-white hover:bg-slate-900 border border-slate-800'
                                }`}
                            >
                                {type === 'all' && <FaFilter className="w-4 h-4 mr-1" />}
                                {type === 'image' && <FaImage className="w-4 h-4 mr-1" />}
                                {type === 'video' && <FaVideo className="w-4 h-4 mr-1" />}
                                {type.charAt(0).toUpperCase() + type.slice(1)}
                            </button>
                        ))}
                    </div>
                </div>
            </div>

            {loading ? (
                <div className="flex h-64 items-center justify-center text-slate-500">Cargando assets...</div>
            ) : filteredScenes.length === 0 ? (
                <div className="border border-dashed border-white/10 rounded-3xl p-12 text-center bg-slate-900/30">
                    <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-gradient-to-br from-emerald-500/20 to-cyan-500/20 flex items-center justify-center border border-white/10">
                        <FaImages className="w-7 h-7 text-emerald-400" />
                    </div>
                    <h3 className="text-xl font-bold text-white mb-2">No hay assets</h3>
                    <p className="text-slate-400 max-w-md mx-auto">
                        Crea un proyecto y genera escenas para ver tus assets aquí.
                    </p>
                </div>
            ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                    {filteredScenes.map((scene, index) => (
                        <div key={`${scene.id}-${index}`} className="group bg-slate-900/60 border border-white/10 rounded-xl overflow-hidden hover:border-emerald-500/30 transition-all">
                            <div className="aspect-video bg-slate-800 relative flex items-center justify-center">
                                {scene.videoAssetId ? (
                                    <div className="w-full h-full flex items-center justify-center">
                                        <FaVideo className="w-12 h-12 text-emerald-400" />
                                        <span className="absolute bottom-2 right-2 text-[10px] bg-black/50 text-white px-2 py-1 rounded">Video</span>
                                    </div>
                                ) : (
                                    <div className="w-full h-full flex items-center justify-center">
                                        <FaImage className="w-12 h-12 text-slate-600" />
                                        <span className="absolute bottom-2 right-2 text-[10px] bg-black/50 text-white px-2 py-1 rounded">Imagen</span>
                                    </div>
                                )}
                                <div className="absolute top-2 left-2">
                                    <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-black/50 text-slate-300 backdrop-blur-md border border-white/10">
                                        {scene.projectName || 'Sin proyecto'}
                                    </span>
                                </div>
                            </div>
                            <div className="p-4 space-y-2">
                                <h3 className="text-sm font-bold text-white truncate" title={scene.title || scene.visualPrompt.slice(0, 50)}>
                                    {scene.title || scene.visualPrompt.slice(0, 50)}
                                </h3>
                                <p className="text-[11px] text-slate-500 line-clamp-2">{scene.visualPrompt}</p>
                                <div className="flex items-center justify-between text-[10px] text-slate-500">
                                    <span>{scene.durationSec}s</span>
                                    <span>{scene.aspectRatio || '9:16'}</span>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}