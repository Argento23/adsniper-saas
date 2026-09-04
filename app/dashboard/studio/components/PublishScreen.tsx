'use client';

import { useState } from 'react';
import {
    FaArrowLeft, FaTiktok, FaInstagram, FaYoutube, FaFacebook,
    FaCheck, FaCalendar, FaImage, FaHashtag, FaPaperPlane,
    FaLink, FaGlobe, FaClock, FaEye, FaShare,
} from 'react-icons/fa';

/**
 * PublishScreen — multi-platform publishing hub.
 *
 * VISUAL ONLY. No backend, no OAuth. Single-component state for
 * selected platforms + form fields. Replace via props when wiring
 * up to a real publish flow.
 *
 * Layout:
 *   ┌──────────────────────────────────────────────────────────────┐
 *   │ Header                                                       │
 *   ├──────────────────────────┬───────────────────────────────────┤
 *   │ Platform cards           │ Publish form (right panel)        │
 *   │  ┌────┐ ┌────┐           │  Title, description, hashtags,    │
 *   │  │ TT │ │ IG │           │  thumbnail, schedule              │
 *   │  └────┘ └────┘           │                                   │
 *   │  ┌────┐ ┌────┐           │  Big "Publicar ahora" button      │
 *   │  │ YT │ │ FB │           │                                   │
 *   │  └────┘ └────┘           │                                   │
 *   └──────────────────────────┴───────────────────────────────────┘
 */

interface PlatformCardData {
    id: 'tiktok' | 'instagram' | 'youtube' | 'facebook';
    name: string;
    handle: string;
    followers: string;
    aspect: string;
    icon: React.ComponentType<{ className?: string }>;
    color: string; // gradient class
    shadowColor: string;
}

const PLATFORMS: PlatformCardData[] = [
    {
        id: 'tiktok',
        name: 'TikTok',
        handle: '@adsintesis',
        followers: '24.8K',
        aspect: '9:16',
        icon: FaTiktok,
        color: 'from-fuchsia-500 to-cyan-400',
        shadowColor: 'shadow-fuchsia-500/30',
    },
    {
        id: 'instagram',
        name: 'Instagram Reels',
        handle: '@adsintesis.studio',
        followers: '12.3K',
        aspect: '9:16',
        icon: FaInstagram,
        color: 'from-orange-500 via-pink-500 to-purple-500',
        shadowColor: 'shadow-pink-500/30',
    },
    {
        id: 'youtube',
        name: 'YouTube Shorts',
        handle: 'Adsíntesis Studio',
        followers: '5.1K',
        aspect: '9:16',
        icon: FaYoutube,
        color: 'from-red-500 to-red-700',
        shadowColor: 'shadow-red-500/30',
    },
    {
        id: 'facebook',
        name: 'Facebook',
        handle: 'Adsíntesis',
        followers: '8.4K',
        aspect: '1:1 · 9:16',
        icon: FaFacebook,
        color: 'from-blue-500 to-blue-700',
        shadowColor: 'shadow-blue-500/30',
    },
];

export default function PublishScreen() {
    const [selected, setSelected] = useState<Set<PlatformCardData['id']>>(
        new Set(['tiktok', 'instagram']),
    );
    const [title, setTitle] = useState('Transformá tu marketing con IA 🚀');
    const [description, setDescription] = useState(
        'Descubrí cómo Adsíntesis genera anuncios profesionales en minutos. ' +
        'Del brief a la exportación final, sin tocar una sola línea de código.',
    );
    const [hashtags, setHashtags] = useState('#Adsintexis #Marketing #IA #Reels');
    const [scheduleEnabled, setScheduleEnabled] = useState(false);
    const [scheduleDate, setScheduleDate] = useState('2026-09-15');
    const [scheduleTime, setScheduleTime] = useState('18:00');

    const togglePlatform = (id: PlatformCardData['id']) => {
        const next = new Set(selected);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        setSelected(next);
    };

    const selectedCount = selected.size;

    return (
        <div className="min-h-screen bg-[#0F1115] text-white font-sans">
            {/* ── Header ───────────────────────────────────────────────── */}
            <header className="sticky top-0 z-30 border-b border-white/5 bg-[#171A21]/95 backdrop-blur-md">
                <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-3">
                    <div className="flex items-center gap-3">
                        <button className="rounded-[10px] p-2 text-slate-400 hover:bg-white/5 hover:text-white transition">
                            <FaArrowLeft className="h-4 w-4" />
                     </button>
                        <div>
                            <p className="text-[10px] uppercase tracking-widest text-slate-500">Publicar</p>
                            <h1 className="text-sm font-semibold text-white">Adsíntesis · Studio Marketing</h1>
                     </div>
                 </div>
                    <div className="flex items-center gap-2">
                        <div className="flex items-center gap-2 rounded-[10px] border border-white/10 bg-white/[0.03] px-3 py-1.5">
                            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                            <span className="text-[11px] text-slate-300">{selectedCount} plataformas</span>
                     </div>
                        <button className="rounded-[10px] border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-medium text-slate-300 hover:bg-white/10 transition">
                            Vista previa
                     </button>
                 </div>
             </div>
         </header>

            <div className="mx-auto grid max-w-7xl grid-cols-1 gap-6 px-6 py-6 lg:grid-cols-5">
                {/* ── Left: Platform cards ──────────────────────────────── */}
                <section className="lg:col-span-3">
                    <div className="mb-4 flex items-center justify-between">
                        <div>
                            <h2 className="text-lg font-semibold text-white">Plataformas</h2>
                            <p className="text-xs text-slate-400">Seleccioná dónde publicar este video</p>
                     </div>
                        <div className="flex items-center gap-1.5">
                            <button className="rounded-[8px] border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] text-slate-300 hover:bg-white/10 transition">
                                Todas
                         </button>
                            <button className="rounded-[8px] border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] text-slate-300 hover:bg-white/10 transition">
                                Ninguna
                         </button>
                     </div>
                 </div>

                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                        {PLATFORMS.map((p) => {
                            const isSelected = selected.has(p.id);
                            const Icon = p.icon;
                            return (
                                <button
                                    key={p.id}
                                    onClick={() => togglePlatform(p.id)}
                                    className={`group relative flex flex-col gap-3 overflow-hidden rounded-[14px] border p-5 text-left transition ${
                                        isSelected
                                            ? `border-violet-500/60 bg-gradient-to-br from-violet-500/10 to-transparent shadow-xl ${p.shadowColor}`
                                            : 'border-white/10 bg-[#171A21] hover:border-white/20'
                                    }`}
                                >
                                    {/* Top row: icon + check */}
                                    <div className="flex items-start justify-between">
                                        <div className={`flex h-12 w-12 items-center justify-center rounded-[12px] bg-gradient-to-br ${p.color} text-white shadow-lg ${p.shadowColor}`}>
                                            <Icon className="h-5 w-5" />
                                 </div>
                                        <div
                                            className={`flex h-6 w-6 items-center justify-center rounded-full border-2 transition ${
                                                isSelected
                                                    ? 'border-violet-500 bg-violet-500'
                                                    : 'border-slate-600 group-hover:border-slate-400'
                                            }`}
                                        >
                                            {isSelected && <FaCheck className="h-2.5 w-2.5 text-white" />}
                                 </div>
                             </div>

                                    {/* Name + handle */}
<div>
    <h3 className="text-base font-semibold text-white">{p.name}</h3>
    <p className="text-xs text-slate-400">{p.handle}</p>
</div>

                                    {/* Meta */}
                                    <div className="flex items-center gap-3 text-[11px] text-slate-400">
                                        <div className="flex items-center gap-1">
                                            <FaEye className="h-2.5 w-2.5" />
                                            {p.followers}
                                 </div>
                                        <span>·</span>
                                        <div className="flex items-center gap-1">
                                            <FaImage className="h-2.5 w-2.5" />
                                            {p.aspect}
                                 </div>
                             </div>

                                    {/* Account selector + status */}
                                    <div className="mt-1 flex items-center gap-2 border-t border-white/5 pt-3">
<div className="flex flex-1 items-center gap-1.5 rounded-[8px] border border-white/10 bg-white/[0.03] px-2 py-1.5">
    <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
    <span className="truncate text-[11px] text-slate-300">{p.handle}</span>
</div>
                                        <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-emerald-400">
                                            Conectado
                                 </span>
                             </div>
                         </button>
                            );
                        })}
                 </div>
             </section>

                {/* ── Right: publish form ────────────────────────────────── */}
                <aside className="lg:col-span-2">
                    <div className="sticky top-[88px] space-y-4">
                        <div>
                            <h2 className="text-lg font-semibold text-white">Detalles del post</h2>
                            <p className="text-xs text-slate-400">Editá el contenido antes de publicar</p>
                 </div>

                        <div className="rounded-[14px] border border-white/10 bg-[#171A21] p-5 space-y-4">
                            {/* Title */}
                            <Field label="Título del video" counter={`${title.length}/150`}>
                                <input
                                    type="text"
                                    value={title}
                                    onChange={(e) => setTitle(e.target.value)}
                                    className="w-full rounded-[10px] border border-white/10 bg-white/[0.03] px-3 py-2 text-sm text-white placeholder-slate-500 outline-none focus:border-violet-500/60 focus:bg-white/[0.06] transition"
                                />
                     </Field>

                            {/* Description */}
                            <Field label="Descripción" counter={`${description.length}/2200`}>
                                <textarea
                                    rows={4}
                                    value={description}
                                    onChange={(e) => setDescription(e.target.value)}
                                    className="w-full resize-none rounded-[10px] border border-white/10 bg-white/[0.03] px-3 py-2 text-sm text-white placeholder-slate-500 outline-none focus:border-violet-500/60 focus:bg-white/[0.06] transition"
                                />
                     </Field>

                            {/* Hashtags */}
                            <Field label="Hashtags" icon={FaHashtag}>
                                <input
                                    type="text"
                                    value={hashtags}
                                    onChange={(e) => setHashtags(e.target.value)}
                                    className="w-full rounded-[10px] border border-white/10 bg-white/[0.03] px-3 py-2 text-sm text-white placeholder-slate-500 outline-none focus:border-violet-500/60 focus:bg-white/[0.06] transition"
                                />
                                <div className="mt-2 flex flex-wrap gap-1.5">
                                    {hashtags.split(/\s+/).filter(Boolean).map((tag) => (
                                        <span key={tag} className="rounded-full bg-violet-500/15 px-2 py-0.5 text-[10px] font-medium text-violet-300 ring-1 ring-violet-500/30">
                                            {tag}
                                 </span>
                                    ))}
                     </div>
                     </Field>

                            {/* Thumbnail */}
                            <Field label="Miniatura">
                                <div className="flex items-center gap-3">
                                    <div className="flex h-16 w-16 items-center justify-center rounded-[10px] bg-gradient-to-br from-violet-500/30 to-fuchsia-500/30 ring-1 ring-white/10">
                                        <FaImage className="h-5 w-5 text-white/60" />
                             </div>
                                    <div className="flex-1">
                                        <button className="rounded-[10px] border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-medium text-slate-300 hover:bg-white/10 transition">
                                            Subir imagen
                                 </button>
                                        <p className="mt-1 text-[10px] text-slate-500">PNG, JPG · 1080×1920 recomendado</p>
                             </div>
                         </div>
                     </Field>

                            {/* Schedule */}
                            <Field label="Programación" icon={FaCalendar}>
                                <div className="flex items-center justify-between rounded-[10px] border border-white/10 bg-white/[0.03] px-3 py-2">
                                    <div className="flex items-center gap-2">
                                        <FaClock className="h-3 w-3 text-slate-400" />
                                        <span className="text-xs text-slate-300">Publicar más tarde</span>
                             </div>
                                    <Switch on={scheduleEnabled} onChange={setScheduleEnabled} />
                         </div>
                                {scheduleEnabled && (
                                    <div className="mt-2 grid grid-cols-2 gap-2">
                                        <input
                                            type="date"
                                            value={scheduleDate}
                                            onChange={(e) => setScheduleDate(e.target.value)}
                                            className="rounded-[10px] border border-white/10 bg-white/[0.03] px-3 py-2 text-xs text-white outline-none focus:border-violet-500/60"
                                        />
                                        <input
                                            type="time"
                                            value={scheduleTime}
                                            onChange={(e) => setScheduleTime(e.target.value)}
                                            className="rounded-[10px] border border-white/10 bg-white/[0.03] px-3 py-2 text-xs text-white outline-none focus:border-violet-500/60"
                                        />
                             </div>
                                )}
                     </Field>
                 </div>

                        {/* Big publish button */}
                        <button className="group flex w-full items-center justify-center gap-2.5 rounded-[14px] bg-gradient-to-r from-violet-500 to-fuchsia-500 px-6 py-4 text-base font-bold text-white shadow-xl shadow-violet-500/30 transition hover:shadow-2xl hover:shadow-violet-500/50 hover:brightness-110">
                            <FaPaperPlane className="h-4 w-4 transition group-hover:translate-x-0.5" />
                            {scheduleEnabled ? 'Programar publicación' : 'Publicar ahora'}
                            <span className="ml-2 rounded-full bg-white/20 px-2 py-0.5 text-xs">
                                {selectedCount}
                     </span>
                 </button>

                        {/* Footer info */}
                        <div className="flex items-center justify-between text-[11px] text-slate-500">
                            <div className="flex items-center gap-1.5">
                                <FaGlobe className="h-3 w-3" />
                                <span>Visible para tu audiencia</span>
                     </div>
                            <div className="flex items-center gap-1.5">
                                <FaLink className="h-3 w-3" />
                                <span>Link público al terminar</span>
                     </div>
                 </div>
             </div>
         </aside>
         </div>
     </div>
    );
}

// ── Sub-components ─────────────────────────────────────────────────────

function Field({
    label, counter, icon: Icon, children,
}: {
    label: string;
    counter?: string;
    icon?: React.ComponentType<{ className?: string }>;
    children: React.ReactNode;
}) {
    return (
        <div>
<div className="mb-1.5 flex items-center justify-between">
    <div className="flex items-center gap-1.5">
        {Icon && <Icon className="h-3 w-3 text-slate-400" />}
        <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">{label}</p>
    </div>
    {counter && <span className="font-mono text-[10px] text-slate-500">{counter}</span>}
</div>
            {children}
     </div>
    );
}

function Switch({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
    return (
        <button
            onClick={() => onChange(!on)}
            className={`relative h-5 w-9 rounded-full transition ${on ? 'bg-violet-500' : 'bg-slate-700'}`}
        >
            <span
                className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition ${
                    on ? 'left-4' : 'left-0.5'
                }`}
            />
     </button>
    );
}
