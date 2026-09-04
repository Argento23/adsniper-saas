'use client';

import { useState } from 'react';
import {
    FaPlay, FaPause, FaSearchPlus, FaSearchMinus, FaPlus, FaCut,
    FaArrowLeft, FaDownload, FaLayerGroup, FaVolumeUp, FaClosedCaptioning,
    FaMusic, FaImage, FaMagic, FaTimes,
} from 'react-icons/fa';

/**
 * EditorTimelinePro — CapCut / Premiere-style timeline.
 *
 * VISUAL ONLY — no backend, no real state. Uses local UI state for
 * hover effects + zoom slider + clip selection. Mock data is
 * hard-coded; replace via props when wiring up to the real timeline.
 *
 * Layout:
 *   ┌──────────────────────────────────────────────────────────────┐
 *   │ Header (project + actions)                                   │
 *   ├───────────┬────────────────────────────┬─────────────────────┤
 *   │ Scenes    │ Preview                    │ Inspector           │
 *   │ (thumbs)  │ (placeholder)              │ (clip props)        │
 *   ├───────────┴────────────────────────────┴─────────────────────┤
 *   │ Transport (Play/Pause/Zoom/Split/Add)                        │
 *   │ Ruler 00:00 ─────────────────────────── 00:30                │
 *   │ Track V1 ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓                             │
 *   │ Track A1 ♪♫ ▁▂▃▄▅▆▇ ▁▂▃▄▅ ▁▂▃▄▅▆▇                       │
 *   │ Track S1 ░░░░░▓▓░░░░░░▓▓▓░░░░▓░░░                          │
 *   └──────────────────────────────────────────────────────────────┘
 */

interface SceneThumb {
    id: string;
    label: string;
    duration: number;
    thumbnail: string; // emoji or letter shown as placeholder
}

interface TimelineClip {
    id: string;
    track: 'V1' | 'A1' | 'S1';
    label: string;
    startSec: number;
    durationSec: number;
    color: string; // tailwind color shortcut
}

const MOCK_SCENES: SceneThumb[] = [
    { id: 's1', label: 'Hook', duration: 3, thumbnail: '🎬' },
    { id: 's2', label: 'Problem', duration: 5, thumbnail: '💡' },
    { id: 's3', label: 'Solution', duration: 6, thumbnail: '✨' },
    { id: 's4', label: 'Demo', duration: 4, thumbnail: '📱' },
    { id: 's5', label: 'CTA', duration: 4, thumbnail: '🚀' },
];

const MOCK_CLIPS: TimelineClip[] = [
    // Video track
    { id: 'c1', track: 'V1', label: 'Hook.mp4', startSec: 0, durationSec: 3, color: 'from-violet-500 to-violet-700' },
    { id: 'c2', track: 'V1', label: 'Problem.mp4', startSec: 3, durationSec: 5, color: 'from-fuchsia-500 to-fuchsia-700' },
    { id: 'c3', track: 'V1', label: 'Solution.mp4', startSec: 8, durationSec: 6, color: 'from-indigo-500 to-indigo-700' },
    { id: 'c4', track: 'V1', label: 'Demo.mp4', startSec: 14, durationSec: 4, color: 'from-blue-500 to-blue-700' },
    { id: 'c5', track: 'V1', label: 'CTA.mp4', startSec: 18, durationSec: 4, color: 'from-purple-500 to-purple-700' },
    // Audio track
    { id: 'a1', track: 'A1', label: 'BGM.mp3', startSec: 0, durationSec: 22, color: 'from-emerald-500 to-emerald-700' },
    { id: 'a2', track: 'A1', label: 'VO.mp3', startSec: 2, durationSec: 18, color: 'from-cyan-500 to-cyan-700' },
    // Subtitles track
    { id: 's1', track: 'S1', label: 'Sub 1', startSec: 0.5, durationSec: 2.5, color: 'from-amber-400 to-amber-600' },
    { id: 's2', track: 'S1', label: 'Sub 2', startSec: 3.5, durationSec: 4, color: 'from-amber-400 to-amber-600' },
    { id: 's3', track: 'S1', label: 'Sub 3', startSec: 8.5, durationSec: 5, color: 'from-amber-400 to-amber-600' },
    { id: 's4', track: 'S1', label: 'Sub 4', startSec: 14.5, durationSec: 3, color: 'from-amber-400 to-amber-600' },
];

const TIMELINE_TOTAL_SEC = 22;

function formatTime(sec: number): string {
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

export default function EditorTimelinePro() {
    const [isPlaying, setIsPlaying] = useState(false);
    const [zoom, setZoom] = useState(50); // px per second
    const [playheadSec, setPlayheadSec] = useState(7);
    const [selectedClipId, setSelectedClipId] = useState<string>('c2');

    const selectedClip = MOCK_CLIPS.find((c) => c.id === selectedClipId);
    const scene = selectedClip
        ? MOCK_SCENES[MOCK_CLIPS.filter((c) => c.track === 'V1').findIndex((c) => c.id === selectedClip.id)]
        : undefined;

    return (
        <div className="flex h-screen flex-col bg-[#0F1115] text-white font-sans overflow-hidden">
            {/* ── Header ───────────────────────────────────────────────── */}
            <header className="flex items-center justify-between border-b border-white/5 bg-[#171A21] px-6 py-3">
                <div className="flex items-center gap-3">
                    <button className="rounded-[10px] p-2 text-slate-400 hover:bg-white/5 hover:text-white transition">
                        <FaArrowLeft className="h-4 w-4" />
                   </button>
                    <div>
                        <p className="text-[10px] uppercase tracking-widest text-slate-500">Proyecto</p>
                        <h1 className="text-sm font-semibold text-white">Adsíntesis · Studio Marketing</h1>
                   </div>
               </div>
                <div className="flex items-center gap-2">
                    <button className="flex items-center gap-2 rounded-[10px] border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-medium text-slate-300 hover:bg-white/10 transition">
                        <FaMagic className="h-3 w-3" /> Mejorar con IA
                   </button>
                    <button className="flex items-center gap-2 rounded-[10px] bg-[#7C3AED] px-4 py-1.5 text-xs font-semibold text-white hover:bg-[#6D28D9] transition shadow-lg shadow-violet-500/20">
                        <FaDownload className="h-3 w-3" /> Exportar
                   </button>
                    <button className="rounded-[10px] p-2 text-slate-400 hover:bg-white/5 hover:text-white transition">
                        <FaTimes className="h-4 w-4" />
                   </button>
               </div>
           </header>

            {/* ── Main 3-column area ───────────────────────────────────── */}
            <div className="flex flex-1 min-h-0">
                {/* Left: scenes library */}
                <aside className="w-60 border-r border-white/5 bg-[#171A21] overflow-y-auto">
                    <div className="px-4 pt-4 pb-2">
                        <p className="text-[10px] uppercase tracking-widest text-slate-500">Escenas</p>
                        <h2 className="mt-1 text-sm font-semibold text-white">Librería</h2>
                   </div>
                    <div className="space-y-1.5 px-2 pb-4">
                        {MOCK_SCENES.map((s, i) => (
                            <button
                                key={s.id}
                                className="group flex w-full items-center gap-3 rounded-[10px] border border-transparent bg-white/[0.03] p-2 text-left hover:border-violet-500/40 hover:bg-white/[0.06] transition"
                            >
                                <div className="flex h-12 w-12 items-center justify-center rounded-[8px] bg-gradient-to-br from-violet-500/30 to-fuchsia-500/30 text-lg ring-1 ring-white/10">
                                    {s.thumbnail}
                               </div>
<div className="min-w-0 flex-1">
    <p className="truncate text-xs font-semibold text-white">{i + 1}. {s.label}</p>
    <p className="text-[10px] text-slate-500">{s.duration}s · 9:16</p>
</div>
                           </button>
                        ))}
                        <button className="mt-2 flex w-full items-center justify-center gap-2 rounded-[10px] border border-dashed border-white/10 px-3 py-2 text-xs text-slate-400 hover:border-violet-500/50 hover:text-white transition">
                            <FaPlus className="h-3 w-3" /> Añadir escena
                       </button>
                   </div>
               </aside>

                {/* Center: preview */}
                <main className="flex flex-1 flex-col">
                    <div className="flex flex-1 items-center justify-center bg-black/40 p-8">
                        <div className="relative aspect-[9/16] h-full max-h-[640px] w-auto overflow-hidden rounded-[14px] bg-gradient-to-br from-violet-500/20 via-fuchsia-500/20 to-cyan-500/20 ring-1 ring-white/10 shadow-2xl">
                            {/* Mock preview content */}
<div className="absolute inset-0 flex flex-col items-center justify-center p-8">
    <div className="mb-4 text-7xl">{scene?.thumbnail ?? '🎬'}</div>
                                <p className="text-center text-lg font-bold text-white drop-shadow-lg">
                                    {scene?.label ?? 'Vista previa'}
                               </p>
                                <p className="mt-2 text-center text-xs text-white/60">
                                    9:16 · 1080×1920 · {formatTime(playheadSec)} / 00:22
                               </p>
                           </div>
                            {/* Top overlay badge */}
                            <div className="absolute top-3 left-3 flex items-center gap-1.5 rounded-full bg-black/60 px-2 py-1 text-[10px] font-medium text-white backdrop-blur-sm">
                                <span className="h-1.5 w-1.5 rounded-full bg-red-500" />
                                PREVIEW
                           </div>
                            {/* Bottom overlay: caption mock */}
                            <div className="absolute bottom-6 left-1/2 -translate-x-1/2 rounded-md bg-black/70 px-3 py-1.5 text-xs font-medium text-white backdrop-blur-sm">
                                Transformá tu marketing en segundos 🚀
                           </div>
                       </div>
                   </div>

                    {/* Center: compact play controls */}
                    <div className="flex items-center justify-center gap-2 border-t border-white/5 bg-[#171A21] px-6 py-2">
                        <span className="font-mono text-xs text-slate-400">{formatTime(playheadSec)}</span>
                        <span className="text-slate-600">/</span>
                        <span className="font-mono text-xs text-slate-500">00:22</span>
                   </div>
               </main>

                {/* Right: inspector */}
                <aside className="w-72 border-l border-white/5 bg-[#171A21] overflow-y-auto">
<div className="px-4 pt-4 pb-2">
    <p className="text-[10px] uppercase tracking-widest text-slate-500">Inspector</p>
    <h2 className="mt-1 text-sm font-semibold text-white">{selectedClip?.label ?? 'Clip'}</h2>
</div>
                    <div className="space-y-4 px-4 pb-4">
                        <FieldGroup label="Propiedades">
                            <Field label="Duración" value={`${selectedClip?.durationSec ?? 0}.0s`} />
                            <Field label="Inicio" value={`${selectedClip?.startSec ?? 0}.0s`} />
                            <Field label="Pista" value={selectedClip?.track ?? '—'} />
                            <Field label="Resolución" value="1080 × 1920" />
                       </FieldGroup>
                        <FieldGroup label="Efectos">
                            <div className="flex flex-wrap gap-1.5">
                                <Pill label="Fade in" />
                                <Pill label="Cross-dissolve" />
                                <Pill label="+ Añadir" tone="violet" />
                           </div>
                       </FieldGroup>
                        <FieldGroup label="Color">
                            <div className="grid grid-cols-6 gap-1.5">
                                {['#7C3AED', '#EC4899', '#06B6D4', '#10B981', '#F59E0B', '#EF4444'].map((c) => (
                                    <button
                                        key={c}
                                        className="aspect-square rounded-md ring-1 ring-white/10 transition hover:scale-110 hover:ring-2 hover:ring-white/40"
                                        style={{ backgroundColor: c }}
                                    />
                                ))}
                           </div>
                       </FieldGroup>
                   </div>
               </aside>
           </div>

            {/* ── Bottom: timeline ────────────────────────────────────── */}
            <section className="border-t border-white/5 bg-[#171A21]">
                {/* Transport controls */}
                <div className="flex items-center justify-between border-b border-white/5 px-4 py-2">
                    <div className="flex items-center gap-1">
                        <button
                            onClick={() => setIsPlaying((p) => !p)}
                            className="flex h-9 w-9 items-center justify-center rounded-full bg-[#7C3AED] text-white shadow-lg shadow-violet-500/30 hover:bg-[#6D28D9] transition"
                        >
                            {isPlaying ? <FaPause className="h-3.5 w-3.5" /> : <FaPlay className="h-3.5 w-3.5 translate-x-0.5" />}
                       </button>
                        <IconButton icon={FaCut} label="Dividir clip" />
                        <IconButton icon={FaPlus} label="Añadir escena" />
                   </div>
                    <div className="flex items-center gap-1.5">
                        <IconButton
                            icon={FaSearchMinus}
                            label="Zoom -"
                            onClick={() => setZoom((z) => Math.max(20, z - 10))}
                        />
                        <div className="px-2 font-mono text-[10px] text-slate-400">{zoom}px/s</div>
                        <IconButton
                            icon={FaSearchPlus}
                            label="Zoom +"
                            onClick={() => setZoom((z) => Math.min(120, z + 10))}
                        />
                   </div>
               </div>

                {/* Ruler + tracks */}
                <div className="relative h-[280px] overflow-x-auto">
                    <div className="relative" style={{ width: `${TIMELINE_TOTAL_SEC * zoom + 240}px` }}>
                        {/* Ruler */}
                        <div className="sticky top-0 z-10 flex h-7 items-end border-b border-white/5 bg-[#0F1115]/95 backdrop-blur-sm pl-[240px]">
                            {Array.from({ length: TIMELINE_TOTAL_SEC + 1 }, (_, i) => (
                                <div
                                    key={i}
                                    className="relative flex-shrink-0 border-l border-white/10"
                                    style={{ width: `${zoom}px` }}
                                >
                                    {i % 5 === 0 && (
                                        <span className="absolute top-1 left-1 text-[10px] font-mono text-slate-400">
                                            {formatTime(i)}
                                       </span>
                                    )}
                               </div>
                            ))}
                       </div>

                        {/* Tracks */}
                        <div className="space-y-0">
                            {/* Video track */}
                            <TrackRow
                                label="Video 1"
                                icon={FaLayerGroup}
                                iconColor="text-violet-400"
                                trackName="V1"
                                totalSec={TIMELINE_TOTAL_SEC}
                                zoom={zoom}
                                labelOffset={240}
                            >
                                {MOCK_CLIPS.filter((c) => c.track === 'V1').map((clip) => (
                                    <ClipBlock
                                        key={clip.id}
                                        clip={clip}
                                        zoom={zoom}
                                        labelOffset={240}
                                        selected={selectedClipId === clip.id}
                                        onClick={() => setSelectedClipId(clip.id)}
                                    />
                                ))}
                           </TrackRow>

                            {/* Audio track */}
                            <TrackRow
                                label="Audio"
                                icon={FaMusic}
                                iconColor="text-emerald-400"
                                trackName="A1"
                                totalSec={TIMELINE_TOTAL_SEC}
                                zoom={zoom}
                                labelOffset={240}
                            >
                                {MOCK_CLIPS.filter((c) => c.track === 'A1').map((clip) => (
                                    <AudioWaveform
                                        key={clip.id}
                                        clip={clip}
                                        zoom={zoom}
                                        labelOffset={240}
                                    />
                                ))}
                           </TrackRow>

                            {/* Subtitles track */}
                            <TrackRow
                                label="Subtítulos"
                                icon={FaClosedCaptioning}
                                iconColor="text-amber-400"
                                trackName="S1"
                                totalSec={TIMELINE_TOTAL_SEC}
                                zoom={zoom}
                                labelOffset={240}
                            >
                                {MOCK_CLIPS.filter((c) => c.track === 'S1').map((clip) => (
                                    <ClipBlock
                                        key={clip.id}
                                        clip={clip}
                                        zoom={zoom}
                                        labelOffset={240}
                                        selected={selectedClipId === clip.id}
                                        onClick={() => setSelectedClipId(clip.id)}
                                        tone="amber"
                                    />
                                ))}
                           </TrackRow>
                       </div>

                        {/* Playhead */}
                        <div
                            className="pointer-events-none absolute top-0 z-20 h-full"
                            style={{ left: `${240 + playheadSec * zoom}px` }}
                        >
                            <div className="absolute top-0 -translate-x-1/2">
                                <div className="h-3 w-3 rotate-45 bg-red-500 shadow-lg shadow-red-500/40" />
                           </div>
                            <div className="absolute top-3 h-[260px] w-0.5 bg-red-500 shadow-lg shadow-red-500/30" />
                       </div>
                   </div>
               </div>
           </section>
       </div>
    );
}

// ── Sub-components ─────────────────────────────────────────────────────

function TrackRow({
    label, icon: Icon, iconColor, trackName, totalSec, zoom, labelOffset, children,
}: {
    label: string;
    icon: React.ComponentType<{ className?: string }>;
    iconColor: string;
    trackName: string;
    totalSec: number;
    zoom: number;
    labelOffset: number;
    children: React.ReactNode;
}) {
    return (
        <div className="relative flex h-20 items-center border-b border-white/5 hover:bg-white/[0.02] transition">
            {/* Left fixed label */}
            <div
                className="sticky left-0 z-10 flex h-full w-[240px] items-center gap-3 border-r border-white/5 bg-[#171A21] px-4"
                style={{ minWidth: labelOffset }}
            >
                <Icon className={`h-3.5 w-3.5 ${iconColor}`} />
<div>
    <p className="text-xs font-semibold text-white">{label}</p>
    <p className="text-[10px] text-slate-500">{trackName}</p>
</div>
           </div>
            {/* Track surface */}
            <div className="relative h-full" style={{ width: `${totalSec * zoom}px`, marginLeft: 0 }}>
                {children}
           </div>
       </div>
    );
}

function ClipBlock({
    clip, zoom, labelOffset, selected, onClick, tone = 'violet',
}: {
    clip: TimelineClip;
    zoom: number;
    labelOffset: number;
    selected: boolean;
    onClick: () => void;
    tone?: 'violet' | 'amber';
}) {
    const left = clip.startSec * zoom;
    const width = clip.durationSec * zoom;
    const palette =
        tone === 'amber'
            ? 'bg-gradient-to-r from-amber-400/80 to-amber-600/80 border-amber-300/50 text-amber-950'
            : 'bg-gradient-to-r ' + clip.color + ' border-white/20 text-white';

    return (
        <button
            onClick={onClick}
            className={`group absolute top-1/2 -translate-y-1/2 overflow-hidden rounded-[8px] border ${palette} text-left shadow-md transition hover:brightness-110 hover:shadow-xl ${
                selected ? 'ring-2 ring-white shadow-2xl' : ''
            }`}
            style={{ left: `${left}px`, width: `${width}px`, height: '52px' }}
        >
            <div className="flex h-full flex-col justify-between px-2 py-1">
                <div className="flex items-center justify-between">
                    <span className="truncate text-[10px] font-bold uppercase tracking-wider">
                        {clip.label}
                   </span>
               </div>
                <div className="flex items-center gap-1.5 text-[9px] opacity-80">
                    <FaImage className="h-2 w-2" />
                    <span className="font-mono">{clip.durationSec}s</span>
               </div>
           </div>
            {/* Right edge handle */}
            <div className="absolute right-0 top-0 h-full w-1 cursor-ew-resize bg-white/0 group-hover:bg-white/30 transition" />
       </button>
    );
}

function AudioWaveform({
    clip, zoom, labelOffset,
}: {
    clip: TimelineClip;
    zoom: number;
    labelOffset: number;
}) {
    const left = clip.startSec * zoom;
    const width = clip.durationSec * zoom;
    // Pseudo-random bars for waveform visual
    const bars = Array.from({ length: 60 }, (_, i) => 0.3 + Math.abs(Math.sin(i * 1.3 + clip.startSec)) * 0.7);

    return (
        <div
            className={`absolute top-1/2 -translate-y-1/2 overflow-hidden rounded-[8px] border border-white/10 bg-gradient-to-r ${clip.color}`}
            style={{ left: `${left}px`, width: `${width}px`, height: '52px' }}
        >
            <div className="flex h-full items-center justify-between gap-0.5 px-2">
                {bars.map((h, i) => (
                    <div
                        key={i}
                        className="w-0.5 rounded-full bg-white/60"
                        style={{ height: `${h * 80}%` }}
                    />
                ))}
           </div>
            <div className="absolute left-2 top-1 flex items-center gap-1 rounded bg-black/40 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-white backdrop-blur-sm">
                <FaVolumeUp className="h-2 w-2" />
                {clip.label}
           </div>
       </div>
    );
}

function IconButton({
    icon: Icon, label, onClick,
}: {
    icon: React.ComponentType<{ className?: string }>;
    label: string;
    onClick?: () => void;
}) {
    return (
        <button
            onClick={onClick}
            title={label}
            className="flex h-8 items-center gap-1.5 rounded-[10px] px-2.5 text-slate-400 hover:bg-white/5 hover:text-white transition"
        >
<Icon className="h-3.5 w-3.5" />
<span className="text-[11px] font-medium">{label}</span>
</button>
    );
}

function FieldGroup({ label, children }: { label: string; children: React.ReactNode }) {
    return (
        <div>
            <p className="mb-2 text-[10px] font-bold uppercase tracking-widest text-slate-500">{label}</p>
            <div className="space-y-1.5">{children}</div>
        </div>
    );
}

function Field({ label, value }: { label: string; value: string }) {
    return (
        <div className="flex items-center justify-between rounded-[8px] bg-white/[0.03] px-2.5 py-1.5">
            <span className="text-[11px] text-slate-400">{label}</span>
            <span className="font-mono text-[11px] font-medium text-white">{value}</span>
        </div>
    );
}

function Pill({ label, tone = 'default' }: { label: string; tone?: 'default' | 'violet' }) {
    return (
        <span
            className={`rounded-full border px-2 py-0.5 text-[10px] font-medium ${
                tone === 'violet'
                    ? 'border-violet-500/40 bg-violet-500/10 text-violet-300'
                    : 'border-white/10 bg-white/5 text-slate-300'
            }`}
        >
            {label}
       </span>
    );
}
