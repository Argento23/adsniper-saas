'use client';

import { useState } from 'react';
import {
    FaTimes, FaDownload, FaFilm, FaCheck, FaCog, FaClock, FaHdd,
} from 'react-icons/fa';

/**
 * ExportModal — centered export dialog.
 *
 * VISUAL ONLY. No backend. Single-component state for selected
 * options; replace via props when wiring to a real export action.
 */

interface ExportModalProps {
    open: boolean;
    onClose?: () => void;
}

type Resolution = '720p' | '1080p' | '4K';
type Fps = '24' | '30' | '60';
type Format = 'mp4' | 'mov';
type Quality = 'alta' | 'muy-alta';

const RESOLUTION_META: Record<Resolution, { w: number; h: number; bitrateMbps: number }> = {
    '720p':  { w: 1280, h: 720,  bitrateMbps: 5 },
    '1080p': { w: 1920, h: 1080, bitrateMbps: 10 },
    '4K':    { w: 3840, h: 2160, bitrateMbps: 35 },
};

const QUALITY_MULTIPLIER: Record<Quality, number> = {
    'alta': 1.0,
    'muy-alta': 1.6,
};

const DURATION_SEC = 22;

function estimateSizeMB(res: Resolution, fps: Fps, fmt: Format, q: Quality): number {
    const base = RESOLUTION_META[res].bitrateMbps;
    const fpsMul = Number(fps) / 30;
    const fmtMul = fmt === 'mov' ? 1.1 : 1.0;
    const qMul = QUALITY_MULTIPLIER[q];
    const mb = (base * fpsMul * fmtMul * qMul * DURATION_SEC) / 8;
    return Math.round(mb * 10) / 10;
}

export default function ExportModal({ open, onClose }: ExportModalProps) {
    const [resolution, setResolution] = useState<Resolution>('1080p');
    const [fps, setFps] = useState<Fps>('30');
    const [format, setFormat] = useState<Format>('mp4');
    const [quality, setQuality] = useState<Quality>('muy-alta');

    if (!open) return null;

    const sizeMB = estimateSizeMB(resolution, fps, format, quality);

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
            <div className="w-full max-w-[520px] overflow-hidden rounded-[14px] border border-white/10 bg-[#171A21] shadow-2xl">
                {/* Header */}
                <header className="flex items-center justify-between border-b border-white/5 px-6 py-4">
                    <div className="flex items-center gap-3">
                        <div className="flex h-9 w-9 items-center justify-center rounded-[10px] bg-violet-500/15 text-violet-400 ring-1 ring-violet-500/30">
                            <FaDownload className="h-4 w-4" />
                      </div>
                        <div>
                            <h2 className="text-base font-semibold text-white">Exportar proyecto</h2>
                            <p className="text-[11px] text-slate-400">Configurá la calidad final del MP4</p>
                      </div>
                  </div>
                    <button
                        onClick={onClose}
                        className="rounded-[10px] p-2 text-slate-400 hover:bg-white/5 hover:text-white transition"
                    >
                        <FaTimes className="h-4 w-4" />
                  </button>
              </header>

                {/* Body */}
                <div className="space-y-5 px-6 py-5 max-h-[70vh] overflow-y-auto">
                    {/* Resolution */}
                    <Section icon={FaFilm} label="Resolución">
                        <div className="grid grid-cols-3 gap-2">
                            {(['720p', '1080p', '4K'] as Resolution[]).map((r) => (
                                <OptionCard
                                    key={r}
                                    label={r}
                                    sublabel={`${RESOLUTION_META[r].w}×${RESOLUTION_META[r].h}`}
                                    selected={resolution === r}
                                    onClick={() => setResolution(r)}
                                    badge={r === '1080p' ? 'Recomendado' : undefined}
                                />
                            ))}
                      </div>
                  </Section>

                    {/* FPS */}
                    <Section icon={FaCog} label="FPS (cuadros por segundo)">
                        <div className="grid grid-cols-3 gap-2">
                            {(['24', '30', '60'] as Fps[]).map((f) => (
                                <OptionCard
                                    key={f}
                                    label={f}
                                    sublabel={f === '24' ? 'Cinematográfico' : f === '30' ? 'Estándar' : 'Fluido'}
                                    selected={fps === f}
                                    onClick={() => setFps(f)}
                                />
                            ))}
                      </div>
                  </Section>

                    {/* Format */}
                    <Section icon={FaFilm} label="Formato">
                        <div className="grid grid-cols-2 gap-2">
                            {(['mp4', 'mov'] as Format[]).map((f) => (
                                <OptionPill
                                    key={f}
                                    label={f.toUpperCase()}
                                    sublabel={f === 'mp4' ? 'Compatibilidad universal' : 'Edición Apple'}
                                    selected={format === f}
                                    onClick={() => setFormat(f)}
                                />
                            ))}
                      </div>
                  </Section>

                    {/* Quality */}
                    <Section icon={FaCog} label="Calidad">
                        <div className="grid grid-cols-2 gap-2">
                            {(['alta', 'muy-alta'] as Quality[]).map((q) => (
                                <OptionPill
                                    key={q}
                                    label={q === 'alta' ? 'Alta' : 'Muy alta'}
                                    sublabel={q === 'alta' ? 'H.264 · CRF 20' : 'H.265 · CRF 18'}
                                    selected={quality === q}
                                    onClick={() => setQuality(q)}
                                    badge={q === 'muy-alta' ? 'Pro' : undefined}
                                />
                            ))}
                      </div>
                  </Section>

                    {/* Summary */}
                    <div className="grid grid-cols-2 gap-3 rounded-[12px] border border-white/5 bg-white/[0.02] p-4">
                        <SummaryItem
                            icon={FaClock}
                            label="Duración"
                            value={`${DURATION_SEC}s`}
                        />
                        <SummaryItem
                            icon={FaHdd}
                            label="Tamaño estimado"
                            value={`${sizeMB} MB`}
                            accent={sizeMB > 50}
                        />
                  </div>
              </div>

                {/* Footer */}
                <footer className="flex items-center justify-end gap-2 border-t border-white/5 bg-[#0F1115]/50 px-6 py-3">
                    <button
                        onClick={onClose}
                        className="rounded-[10px] border border-white/10 bg-transparent px-4 py-2 text-sm font-medium text-slate-300 hover:bg-white/5 hover:text-white transition"
                    >
                        Cancelar
                  </button>
                    <button className="flex items-center gap-2 rounded-[10px] bg-[#7C3AED] px-5 py-2 text-sm font-semibold text-white shadow-lg shadow-violet-500/30 hover:bg-[#6D28D9] transition">
                        <FaDownload className="h-3.5 w-3.5" />
                        Exportar
                  </button>
              </footer>
          </div>
      </div>
    );
}

// ── Sub-components ─────────────────────────────────────────────────────

function Section({
    icon: Icon, label, children,
}: {
    icon: React.ComponentType<{ className?: string }>;
    label: string;
    children: React.ReactNode;
}) {
    return (
        <div>
<div className="mb-2.5 flex items-center gap-2">
    <Icon className="h-3.5 w-3.5 text-slate-400" />
    <p className="text-[11px] font-bold uppercase tracking-widest text-slate-400">{label}</p>
</div>
            {children}
      </div>
    );
}

function OptionCard({
    label, sublabel, selected, onClick, badge,
}: {
    label: string;
    sublabel: string;
    selected: boolean;
    onClick: () => void;
    badge?: string;
}) {
    return (
        <button
            onClick={onClick}
            className={`relative flex flex-col items-start gap-0.5 rounded-[10px] border px-3 py-2.5 text-left transition ${
                selected
                    ? 'border-violet-500/60 bg-violet-500/10 shadow-lg shadow-violet-500/10'
                    : 'border-white/10 bg-white/[0.03] hover:border-white/20 hover:bg-white/[0.06]'
            }`}
        >
            {selected && (
                <span className="absolute top-1.5 right-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-violet-500 text-white">
                    <FaCheck className="h-2 w-2" />
              </span>
            )}
            {badge && !selected && (
                <span className="absolute top-1.5 right-1.5 rounded-full bg-white/5 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-violet-300">
                    {badge}
              </span>
            )}
<p className={`text-sm font-bold ${selected ? 'text-white' : 'text-white'}`}>{label}</p>
<p className="text-[10px] text-slate-400">{sublabel}</p>
</button>
    );
}

function OptionPill({
    label, sublabel, selected, onClick, badge,
}: {
    label: string;
    sublabel: string;
    selected: boolean;
    onClick: () => void;
    badge?: string;
}) {
    return (
        <button
            onClick={onClick}
            className={`relative flex items-center gap-3 rounded-[10px] border px-3 py-2.5 text-left transition ${
                selected
                    ? 'border-violet-500/60 bg-violet-500/10'
                    : 'border-white/10 bg-white/[0.03] hover:border-white/20 hover:bg-white/[0.06]'
            }`}
        >
            <div
                className={`flex h-4 w-4 items-center justify-center rounded-full border-2 transition ${
                    selected ? 'border-violet-500 bg-violet-500' : 'border-slate-500'
                }`}
            >
                {selected && <span className="h-1.5 w-1.5 rounded-full bg-white" />}
          </div>
            <div className="flex-1">
<div className="flex items-center gap-2">
    <p className="text-sm font-semibold text-white">{label}</p>
    {badge && (
                        <span className="rounded-full bg-violet-500/20 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-violet-300">
                            {badge}
                      </span>
                    )}
              </div>
<p className="text-[10px] text-slate-400">{sublabel}</p>
</div>
</button>
    );
}

function SummaryItem({
    icon: Icon, label, value, accent = false,
}: {
    icon: React.ComponentType<{ className?: string }>;
    label: string;
    value: string;
    accent?: boolean;
}) {
    return (
        <div className="flex items-center gap-2.5">
            <div className={`flex h-9 w-9 items-center justify-center rounded-[10px] ${accent ? 'bg-amber-500/15 text-amber-400' : 'bg-violet-500/15 text-violet-400'}`}>
                <Icon className="h-4 w-4" />
          </div>
<div>
    <p className="text-[10px] uppercase tracking-widest text-slate-500">{label}</p>
    <p className={`font-mono text-sm font-bold ${accent ? 'text-amber-300' : 'text-white'}`}>{value}</p>
</div>
      </div>
    );
}
