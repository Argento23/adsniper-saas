'use client';

import { useEffect, useState } from 'react';
import { useUser } from '@clerk/nextjs';
import { FaPlus, FaTrash, FaFilm, FaClock, FaCalendarAlt, FaMagic, FaImages } from 'react-icons/fa';
import Link from 'next/link';
import {
    getProjectStore,
    CreateProjectInput,
} from '@/lib/projects/store';
import { Project, Brief } from '@/lib/projects/types';

function formatDate(iso: string): string {
    try {
        const d = new Date(iso);
        return d.toLocaleDateString('es-AR', { day: '2-digit', month: 'short', year: 'numeric' });
    } catch {
        return iso;
    }
}

function defaultBrief(): Brief {
    return {
        product: '',
        objective: 'conversion',
        audience: '',
        platform: 'reels',
        style: 'Cinematográfico',
        language: 'es',
        referenceImages: [],
        productPhotos: [],
    };
}

function ProjectCard({
    project,
    onDelete,
}: {
    project: Project;
    onDelete: (id: string) => void;
}) {
    return (
        <div className="group bg-slate-900/60 border border-white/10 rounded-2xl overflow-hidden hover:border-emerald-500/30 transition-all relative">
            <Link href={`/dashboard/studio/projects/${project.id}`} className="block">
                <div className="aspect-video bg-gradient-to-br from-slate-800 to-slate-900 relative flex items-center justify-center">
                    <FaImages className="w-10 h-10 text-slate-700" />
                    <span className="absolute top-3 left-3 text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-black/50 text-slate-300 backdrop-blur-md border border-white/10">
                        {project.format}
                    </span>
                    <span className="absolute top-3 right-3 text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 backdrop-blur-md border border-emerald-500/20">
                        {project.status}
                    </span>
                </div>
                <div className="p-5 space-y-3">
                    <h3 className="text-base font-bold text-white truncate" title={project.name}>
                        {project.name}
                    </h3>
                    <div className="flex items-center gap-4 text-xs text-slate-400">
                        <span className="flex items-center gap-1.5">
                            <FaClock className="w-3 h-3" /> {project.duration}s
                        </span>
                        <span className="flex items-center gap-1.5">
                            <FaCalendarAlt className="w-3 h-3" /> {formatDate(project.updatedAt)}
                        </span>
                    </div>
                </div>
            </Link>
            <div className="px-5 pb-5 flex items-center justify-between border-t border-white/5 pt-3">
                <span className="text-[10px] text-slate-500 truncate">
                    {project.brief.product || 'Sin producto definido'}
                </span>
                <button
                    onClick={() => {
                        if (confirm(`¿Eliminar "${project.name}"?`)) onDelete(project.id);
                    }}
                    className="opacity-0 group-hover:opacity-100 transition-opacity text-slate-500 hover:text-red-400 p-1"
                    title="Eliminar proyecto"
                >
                    <FaTrash className="w-3.5 h-3.5" />
                </button>
            </div>
        </div>
    );
}

export default function StudioHomePage() {
    const { user, isLoaded } = useUser();
    const [projects, setProjects] = useState<Project[]>([]);
    const [creating, setCreating] = useState(false);
    const [name, setName] = useState('');
    const [product, setProduct] = useState('');
    const [format, setFormat] = useState<'9:16' | '1:1' | '16:9' | '4:5'>('9:16');
    const [duration, setDuration] = useState(20);

    const userId = user?.id ?? '';
    const store = getProjectStore();

    function refresh() {
        if (!userId) return;
        setProjects(store.listProjects(userId));
    }

    useEffect(() => {
        if (isLoaded && userId) refresh();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isLoaded, userId]);

    function handleCreate(e: React.FormEvent) {
        e.preventDefault();
        if (!userId) return;
        if (!name.trim()) return;
        const brief: Brief = { ...defaultBrief(), product: product.trim() };
        const input: CreateProjectInput = {
            userId,
            name: name.trim(),
            brief,
            format,
            duration,
        };
        const created = store.createProject(input);
        setProjects(prev => [created, ...prev]);
        setCreating(false);
        setName('');
        setProduct('');
    }

    function handleDelete(id: string) {
        if (!userId) return;
        store.deleteProject(userId, id);
        setProjects(prev => prev.filter(p => p.id !== id));
    }

    return (
        <div className="space-y-10 max-w-6xl">
            <header className="space-y-3">
                <h1 className="text-4xl md:text-5xl font-bold tracking-tight">
                    Adsíntesis <span className="text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 to-cyan-400">Studio</span>
                </h1>
                <p className="text-slate-400 text-lg max-w-2xl">
                    Convierte una idea en contenido publicitario listo para publicar.
                </p>
            </header>

            <section className="bg-slate-900/60 border border-white/10 rounded-3xl p-6 md:p-8 shadow-2xl backdrop-blur-xl">
                {!creating ? (
                    <button
                        onClick={() => setCreating(true)}
                        className="w-full flex items-center justify-center gap-3 bg-gradient-to-r from-emerald-500 to-cyan-600 text-white font-bold py-5 rounded-2xl shadow-lg shadow-emerald-500/20 hover:brightness-110 transition-all"
                    >
                        <FaPlus className="w-5 h-5" />
                        Nuevo proyecto
                    </button>
                ) : (
                    <form onSubmit={handleCreate} className="space-y-5">
                        <div className="flex items-center gap-3 text-white">
                            <FaMagic className="text-emerald-400" />
                            <h2 className="text-lg font-bold">Crear proyecto</h2>
                        </div>
                        <div className="grid md:grid-cols-2 gap-4">
                            <div>
                                <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">
                                    Nombre del proyecto
                                </label>
                                <input
                                    type="text"
                                    value={name}
                                    onChange={e => setName(e.target.value)}
                                    placeholder="Ej: Lanzamiento verano 2026"
                                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-white focus:border-emerald-500/50 outline-none"
                                    required
                                    autoFocus
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">
                                    Producto
                                </label>
                                <input
                                    type="text"
                                    value={product}
                                    onChange={e => setProduct(e.target.value)}
                                    placeholder="Ej: Café de origen"
                                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-white focus:border-emerald-500/50 outline-none"
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">
                                    Formato
                                </label>
                                <select
                                    value={format}
                                    onChange={e => setFormat(e.target.value as typeof format)}
                                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-white focus:border-emerald-500/50 outline-none"
                                >
                                    <option value="9:16">9:16 — Reels / TikTok / Shorts</option>
                                    <option value="1:1">1:1 — Instagram Feed</option>
                                    <option value="4:5">4:5 — Instagram Feed vertical</option>
                                    <option value="16:9">16:9 — YouTube / Web</option>
                                </select>
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">
                                    Duración (segundos)
                                </label>
                                <input
                                    type="number"
                                    min={5}
                                    max={120}
                                    value={duration}
                                    onChange={e => setDuration(Number(e.target.value) || 20)}
                                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-white focus:border-emerald-500/50 outline-none"
                                />
                            </div>
                        </div>
                        <div className="flex justify-end gap-3 pt-2">
                            <button
                                type="button"
                                onClick={() => setCreating(false)}
                                className="px-5 py-2.5 rounded-xl text-sm font-bold text-slate-400 hover:text-white"
                            >
                                Cancelar
                            </button>
                            <button
                                type="submit"
                                disabled={!name.trim()}
                                className="px-5 py-2.5 rounded-xl text-sm font-bold bg-gradient-to-r from-emerald-500 to-cyan-600 text-white shadow-lg shadow-emerald-500/20 hover:brightness-110 disabled:opacity-50"
                            >
                                Crear proyecto
                            </button>
                        </div>
                    </form>
                )}
            </section>

            <section className="space-y-4">
                <div className="flex items-center justify-between">
                    <h2 className="text-2xl font-bold flex items-center gap-2">
                        <FaFilm className="text-emerald-400" /> Tus proyectos
                    </h2>
                    {projects.length > 0 && (
                        <span className="text-xs text-slate-500 font-bold uppercase tracking-wider">
                            {projects.length} {projects.length === 1 ? 'proyecto' : 'proyectos'}
                        </span>
                    )}
                </div>

                {!isLoaded ? (
                    <div className="text-center py-16 text-slate-500">Cargando...</div>
                ) : projects.length === 0 ? (
                    <div className="border border-dashed border-white/10 rounded-3xl p-12 text-center bg-slate-900/30">
                        <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-gradient-to-br from-emerald-500/20 to-cyan-500/20 flex items-center justify-center border border-white/10">
                            <FaFilm className="w-7 h-7 text-emerald-400" />
                        </div>
                        <h3 className="text-xl font-bold text-white mb-2">Tu próximo contenido empieza aquí.</h3>
                        <p className="text-slate-400 mb-6 max-w-md mx-auto">
                            Creá tu primer proyecto para empezar a diseñar anuncios profesionales con IA.
                        </p>
                        {!creating && (
                            <button
                                onClick={() => setCreating(true)}
                                className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-gradient-to-r from-emerald-500 to-cyan-600 text-white font-bold shadow-lg hover:brightness-110 transition-all"
                            >
                                <FaPlus className="w-4 h-4" /> Crear proyecto
                            </button>
                        )}
                    </div>
                ) : (
                    <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
                        {projects.map(p => (
                            <ProjectCard key={p.id} project={p} onDelete={handleDelete} />
                        ))}
                    </div>
                )}
            </section>
        </div>
    );
}
