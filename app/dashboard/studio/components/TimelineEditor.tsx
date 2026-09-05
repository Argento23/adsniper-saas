'use client';

import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import {
    FaPlay, FaPause, FaSave, FaTrash, FaArrowLeft, FaArrowRight, FaFilm, FaSpinner, FaTimes, FaSync, FaCheckCircle, FaClock, FaExclamationTriangle, FaCircle, FaDownload, FaCopy, FaPlus, FaEdit,
} from 'react-icons/fa';
import { Timeline, TimelineClip } from '@/lib/projects/timeline';
import { Scene } from '@/lib/projects/types';
import { getTimelineStore } from '@/lib/projects/timeline-store';
import { getSceneStore } from '@/lib/projects/scenes';
import { getProjectStore } from '@/lib/projects/store';
import {
    TimelineEditorState,
    initialState,
    reducer,
    getCurrentClip,
    getSelectedClip,
    formatTime,
} from '@/lib/timeline-editor/state';
import {
    buildTimelineFromProjectScenes,
    getSceneVideoStatus,
    syncTimelineWithScenes,
} from '@/lib/projects/scene-integration';
import { useToast } from './Toast';

interface TimelineEditorProps {
    projectId: string;
    scenes: Scene[];
    aspectRatio: string;
    onClose?: () => void;
    project?: { id: string; userId: string; name: string; format: string } | null;
}

/**
 * Timeline editor MVP — Phases 6C + 6D.
 *
 * Renders:
 *   - HTML5 video preview (uses current clip's sourceUrl when available)
 *   - Transport controls (play/pause/seek + time display)
 *   - Ruler with proportional clip blocks + status icons per clip
 *   - Click to select, drag to reorder, inline duration edit, delete
 *   - Save button that PATCHes the timeline
 *   - Status legend (pending / generating / ready / failed)
 */
export default function TimelineEditor({ projectId, scenes, aspectRatio, onClose, project }: TimelineEditorProps) {
    const [state, dispatch] = useReducer(reducer, initialState);
    const videoRef = useRef<HTMLVideoElement | null>(null);
    const [draggingIndex, setDraggingIndex] = useState<number | null>(null);
    const { showToast } = useToast();

    // Autosave timer
    useEffect(() => {
        if (!state.dirty || !state.timeline) return;
        const timer = setTimeout(() => {
            onSave();
        }, 2000);
        return () => clearTimeout(timer);
    }, [state.dirty, state.timeline]);

    // Keyboard shortcuts
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if ((e.ctrlKey || e.metaKey) && e.key === 's') {
                e.preventDefault();
                onSave();
            }
            if (e.key === ' ') {
                if (document.activeElement?.tagName !== 'INPUT' && document.activeElement?.tagName !== 'TEXTAREA') {
                    e.preventDefault();
                    dispatch({ type: state.isPlaying ? 'PAUSE' : 'PLAY' });
                }
            }
            if (e.key === 'ArrowLeft') {
                if (document.activeElement?.tagName !== 'INPUT' && document.activeElement?.tagName !== 'TEXTAREA') {
                    onSeekStart();
                }
            }
            if (e.key === 'ArrowRight') {
                if (document.activeElement?.tagName !== 'INPUT' && document.activeElement?.tagName !== 'TEXTAREA') {
                    onSeekEnd();
                }
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [state.isPlaying]);

    // ── Load timeline on mount ──────────────────────────────────────────
    useEffect(() => {
        let cancelled = false;
        (async () => {
            dispatch({ type: 'LOAD_START' });
            try {
                // Load timeline directly from localStorage (client-side)
                const timelineStore = getTimelineStore();
                const t = timelineStore.getTimeline(projectId);
                if (cancelled) return;
                if (t) {
                    dispatch({ type: 'LOAD_SUCCESS', timeline: t });
                    return;
                }
                // No persisted timeline yet — auto-build from scenes (in memory).
                if (scenes.length > 0) {
                    const built = buildTimelineFromProjectScenes({
                        timelineId: `tl_${projectId}`,
                        projectId,
                        scenes,
                        aspectRatio,
                    });
                    dispatch({ type: 'LOAD_SUCCESS', timeline: built });
                } else {
                    dispatch({ type: 'LOAD_SUCCESS', timeline: null });
                }
            } catch (e: unknown) {
                if (!cancelled) dispatch({ type: 'LOAD_FAIL', error: e instanceof Error ? e.message : 'load failed' });
            }
        })();
        return () => { cancelled = true; };
    }, [projectId, scenes, aspectRatio]);

    // ── Playback tick (rAF) ─────────────────────────────────────────────
    useEffect(() => {
        if (!state.isPlaying || !state.timeline) return;
        let raf = 0;
        let last = performance.now();
        const tick = (now: number) => {
            const dt = (now - last) / 1000;
            last = now;
            dispatch({ type: 'TICK', timeSec: state.currentTimeSec + dt });
            raf = requestAnimationFrame(tick);
        };
        raf = requestAnimationFrame(tick);
        return () => cancelAnimationFrame(raf);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [state.isPlaying, state.timeline?.id]);

    // ── Video element sync ──────────────────────────────────────────────
    const currentClip = getCurrentClip(state);
    useEffect(() => {
        const v = videoRef.current;
        if (!v) return;
        if (currentClip?.sourceUrl) {
            if (v.src !== currentClip.sourceUrl) v.src = currentClip.sourceUrl;
        } else if (v.src) {
            v.removeAttribute('src');
            v.load();
        }
    }, [currentClip?.sourceUrl]);

    useEffect(() => {
        const v = videoRef.current;
        if (!v || !currentClip) return;
        const localTime = state.currentTimeSec - currentClip.start;
        if (Math.abs(v.currentTime - localTime) > 0.25) v.currentTime = localTime;
        if (state.isPlaying && v.paused) v.play().catch(() => undefined);
        if (!state.isPlaying && !v.paused) v.pause();
    }, [state.currentTimeSec, state.isPlaying, currentClip?.id]);

    // ── Actions ─────────────────────────────────────────────────────────
    const onSelect = useCallback((clipId: string) => {
        dispatch({ type: 'SELECT', clipId });
    }, []);

    const onDragStart = useCallback((index: number) => setDraggingIndex(index), []);
    const onDragOver = useCallback((e: React.DragEvent) => e.preventDefault(), []);
    const onDrop = useCallback((targetIndex: number) => {
        if (draggingIndex === null || draggingIndex === targetIndex) {
            setDraggingIndex(null);
            return;
        }
        dispatch({ type: 'REORDER', fromIndex: draggingIndex, toIndex: targetIndex });
        setDraggingIndex(null);
    }, [draggingIndex]);

    const onDurationEdit = useCallback((clipId: string, raw: string) => {
        const v = Number(raw);
        if (!Number.isFinite(v) || v <= 0) return;
        dispatch({ type: 'UPDATE_CLIP', clipId, patch: { duration: Math.floor(v) } });
    }, []);

    const onTransitionEdit = useCallback((clipId: string, value: 'cut' | 'fade' | 'dissolve') => {
        dispatch({ type: 'UPDATE_CLIP', clipId, patch: { transition: value } });
    }, []);

    const onDelete = useCallback((clipId: string) => {
        if (!state.timeline) return;
        if (!confirm('¿Eliminar este clip?')) return;
        // Delete clip directly from localStorage
        const timelineStore = getTimelineStore();
        const updated = timelineStore.deleteClip(projectId, clipId);
        if (updated) {
            dispatch({ type: 'LOAD_SUCCESS', timeline: updated });
        } else {
            dispatch({ type: 'DELETE_CLIP', clipId });
        }
    }, [projectId, state.timeline]);

    const onDuplicate = useCallback((clipId: string) => {
        if (!state.timeline) return;
        const clip = state.timeline.clips.find(c => c.id === clipId);
        if (!clip) return;

        const timelineStore = getTimelineStore();
        const sceneStore = getSceneStore();

        // Duplicate the scene in localStorage
        const originalScene = sceneStore.getScene(projectId, clip.sceneId);
        if (!originalScene) return;

        const newScene = sceneStore.createScene({
            projectId,
            order: originalScene.order + 1,
            visualPrompt: originalScene.visualPrompt,
            durationSec: originalScene.durationSec,
            title: originalScene.title ? `${originalScene.title} (copy)` : undefined,
            description: originalScene.description,
            prompt: originalScene.prompt,
            negativePrompt: originalScene.negativePrompt,
            camera: originalScene.camera,
            voiceover: originalScene.voiceover,
            onScreenText: originalScene.onScreenText,
            aspectRatio: originalScene.aspectRatio,
            transitionIn: originalScene.transitionIn,
        });

        // Re-sync timeline with new scene
        onRebuildFromScenes();
        showToast('success', `Escena duplicada: ${newScene.title ?? 'Sin título'}`);
    }, [projectId, state.timeline, scenes, aspectRatio]);

    const onSave = useCallback(() => {
        if (!state.timeline) return;
        dispatch({ type: 'SAVE_START' });
        try {
            const timelineStore = getTimelineStore();
            // Check if timeline exists by trying to get it
            const existing = timelineStore.getTimeline(projectId);
            let saved: Timeline;
            if (existing) {
                // Update existing timeline
                saved = timelineStore.upsertTimeline({ ...state.timeline, updatedAt: new Date().toISOString() });
            } else {
                // Create new timeline
                saved = timelineStore.upsertTimeline({ ...state.timeline, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
            }
            dispatch({ type: 'SAVE_SUCCESS', timeline: saved });
            showToast('success', 'Proyecto guardado');
        } catch (e: unknown) {
            dispatch({ type: 'SAVE_FAIL', error: e instanceof Error ? e.message : 'save failed' });
            showToast('error', 'Error al guardar');
        }
    }, [projectId, state.timeline]);

    const onRebuildFromScenes = useCallback(() => {
        if (scenes.length === 0) return;
        const fresh = buildTimelineFromProjectScenes({
            timelineId: state.timeline?.id ?? `tl_${projectId}`,
            projectId,
            scenes,
            aspectRatio,
        });
        // If we already had a timeline, try to preserve user-chosen
        // ordering by syncing the fresh clip set against the existing
        // order (drop removed, keep order of kept).
        const next = state.timeline
            ? syncTimelineWithScenes({
                timeline: { ...state.timeline, clips: fresh.clips },
                scenes,
            })
            : fresh;
        dispatch({ type: 'LOAD_SUCCESS', timeline: next });
    }, [scenes, aspectRatio, projectId, state.timeline]);

    const onSeekTo = useCallback((timeSec: number) => {
        dispatch({ type: 'SEEK', timeSec });
    }, []);

    const onSeekStart = useCallback(() => dispatch({ type: 'SEEK', timeSec: 0 }), []);
    const onSeekEnd = useCallback(() => {
        const dur = state.timeline?.duration ?? 0;
        dispatch({ type: 'SEEK', timeSec: dur });
    }, [state.timeline?.duration]);

    // ── Render ──────────────────────────────────────────────────────────
    if (state.loading) {
        return (
            <div className="bg-slate-900/60 border border-white/10 rounded-2xl p-12 text-center text-slate-400 backdrop-blur-xl">
                <FaSpinner className="w-6 h-6 mx-auto mb-3 animate-spin" />
                Cargando timeline...
           </div>
        );
    }

    if (state.error) {
        return (
            <div className="bg-red-500/10 border border-red-500/30 text-red-300 rounded-2xl p-4 text-sm">
                Error: {state.error}
           </div>
        );
    }

    if (!state.timeline) {
        return (
            <div className="border border-dashed border-white/10 rounded-2xl p-8 text-center bg-slate-900/30 text-slate-400">
                <FaFilm className="w-8 h-8 mx-auto mb-3 text-slate-600" />
                No hay escenas en este proyecto todavía.
           </div>
        );
    }

    const t = state.timeline;
    const selected = getSelectedClip(state);
    const hasSourceUrl = t.clips.some(c => c.sourceUrl);

return (
        <div className="bg-slate-900/60 border border-white/10 rounded-2xl p-6 backdrop-blur-xl space-y-5" data-testid="timeline-editor">
            {/* Header */}
            <div className="flex items-center justify-between">
                <h3 className="text-lg font-bold text-white flex items-center gap-2">
                    <FaFilm className="text-emerald-400" />
                    Timeline Editor
                    <span className="text-xs text-slate-500 font-mono ml-2">{t.id}</span>
               </h3>
                <div className="flex items-center gap-2">
                    {state.dirty && (
                        <span className="text-xs text-amber-400 font-bold">● Sin guardar</span>
                    )}
                    <button
                        onClick={() => {
                            const sceneStore = getSceneStore();
                            const newScene = sceneStore.createScene({
                                projectId,
                                order: t.clips.length,
                                visualPrompt: 'Nueva escena',
                                durationSec: 5,
                                title: 'Nueva escena',
                            });
                            onRebuildFromScenes();
                            showToast('success', `Escena creada: ${newScene.title}`);
                        }}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gradient-to-r from-emerald-500 to-cyan-600 text-white text-xs font-bold shadow-lg hover:brightness-110"
                        title="Agregar nueva escena"
                    >
                        <FaPlus /> Nueva escena
                   </button>
                    <button
                        onClick={onRebuildFromScenes}
                        disabled={scenes.length === 0}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold border border-white/10 disabled:opacity-40"
                        title="Reconstruir desde las escenas"
                    >
                        <FaSync /> Re-sync
                   </button>
                    {onClose && (
                        <button onClick={onClose} className="text-slate-500 hover:text-white p-1">
                            <FaTimes />
                       </button>
                    )}
              </div>
          </div>

            {/* Preview */}
            <div className="aspect-video bg-black rounded-xl overflow-hidden border border-white/5 relative">
                {hasSourceUrl ? (
                    <video
                        ref={videoRef}
                        className="w-full h-full object-contain"
                        muted
                        playsInline
                        preload="metadata"
                    />
                ) : (
                    <div className="absolute inset-0 flex items-center justify-center text-slate-600">
                        <div className="text-center">
                            <FaFilm className="w-12 h-12 mx-auto mb-3 opacity-30" />
                            <div className="text-sm">Sin video aún. Generá keyframes/videos desde cada escena</div>
                       </div>
                   </div>
                )}
                {/* Time overlay */}
                <div className="absolute bottom-2 right-2 bg-black/70 backdrop-blur-sm text-white text-xs font-mono px-2 py-1 rounded-md">
                    {formatTime(state.currentTimeSec)} / {formatTime(t.duration)}
               </div>
                {currentClip && (
                    <div className="absolute top-2 left-2 bg-black/70 backdrop-blur-sm text-white text-xs px-2 py-1 rounded-md">
                        Clip {t.clips.indexOf(currentClip) + 1} / {t.clips.length}
                   </div>
                )}
           </div>

            {/* Transport controls */}
            <div className="flex items-center gap-3 bg-slate-950 rounded-xl p-3 border border-white/5">
                <button
                    onClick={onSeekStart}
                    className="text-slate-400 hover:text-white text-xs px-2 py-1"
                    title="Inicio"
                >
                    <FaArrowLeft />
               </button>
                <button
                    onClick={() => dispatch({ type: state.isPlaying ? 'PAUSE' : 'PLAY' })}
                    className="w-10 h-10 rounded-full bg-gradient-to-br from-emerald-500 to-cyan-600 text-white flex items-center justify-center shadow-lg hover:brightness-110"
                    title={state.isPlaying ? 'Pause' : 'Play'}
                >
                    {state.isPlaying ? <FaPause /> : <FaPlay className="ml-0.5" />}
               </button>
                <button
                    onClick={onSeekEnd}
                    className="text-slate-400 hover:text-white text-xs px-2 py-1"
                    title="Final"
                >
                    <FaArrowRight />
               </button>
                <div className="flex-1 mx-3">
                    <input
                        type="range"
                        min={0}
                        max={Math.max(1, t.duration)}
                        step={0.1}
                        value={state.currentTimeSec}
                        onChange={e => onSeekTo(Number(e.target.value))}
                        className="w-full accent-emerald-500"
                    />
               </div>
                <button
                    onClick={onSave}
                    disabled={state.saving || !state.dirty}
                    className="flex items-center gap-2 px-4 py-2 rounded-lg bg-gradient-to-r from-emerald-500 to-cyan-600 text-white text-sm font-bold shadow-lg hover:brightness-110 disabled:opacity-50"
                >
                    {state.saving ? <FaSpinner className="animate-spin" /> : <FaSave />}
                    {state.saving ? 'Guardando...' : 'Guardar'}
               </button>
           </div>

            {/* Ruler */}
            <TimelineRuler
                timeline={t}
                scenes={scenes}
                currentTimeSec={state.currentTimeSec}
                selectedClipId={state.selectedClipId}
                draggingIndex={draggingIndex}
                onSeek={onSeekTo}
                onSelect={onSelect}
                onDragStart={onDragStart}
                onDragOver={onDragOver}
                onDrop={onDrop}
            />

            {/* Status legend */}
            <StatusLegend scenes={scenes} />

            {/* Selected clip inspector */}
{selected ? (
                <div className="bg-slate-950 border border-white/10 rounded-xl p-4 space-y-3">
                    <div className="text-xs text-slate-400 uppercase tracking-wider font-bold">Clip seleccionado</div>
                    <div className="grid sm:grid-cols-4 gap-3 text-sm">
                        <div>
                            <label className="block text-xs text-slate-500 mb-1">Título</label>
                            <input
                                type="text"
                                value={selected.title ?? ''}
                                onChange={e => dispatch({ type: 'UPDATE_CLIP', clipId: selected.id, patch: { title: e.target.value } })}
                                placeholder="Sin título"
                                className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-1.5 text-white focus:border-emerald-500/50 outline-none"
                            />
                       </div>
                        <div>
                            <label className="block text-xs text-slate-500 mb-1">Duración (s)</label>
                            <input
                                type="number"
                                min={1}
                                max={60}
                                value={selected.duration}
                                onChange={e => onDurationEdit(selected.id, e.target.value)}
                                className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-1.5 text-white focus:border-emerald-500/50 outline-none"
                            />
                       </div>
                        <div>
                            <label className="block text-xs text-slate-500 mb-1">Transición</label>
                            <select
                                value={selected.transition ?? 'cut'}
                                onChange={e => onTransitionEdit(selected.id, e.target.value as 'cut' | 'fade' | 'dissolve')}
                                className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-1.5 text-white focus:border-emerald-500/50 outline-none"
                            >
                                <option value="cut">Cut</option>
                                <option value="fade">Fade</option>
                                <option value="dissolve">Dissolve</option>
                           </select>
                        </div>
                        <div className="flex items-end gap-2">
                            <button
                                onClick={() => onDuplicate(selected.id)}
                                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold border border-white/10"
                            >
                                <FaCopy /> Duplicar
                           </button>
                            <button
                                onClick={() => onDelete(selected.id)}
                                className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-red-500/20 text-red-300 border border-red-500/30 hover:bg-red-500/30 text-sm"
                            >
                                <FaTrash /> Eliminar
                           </button>
                        </div>
                    </div>
                     <div className="text-xs text-slate-500 font-mono">
                        sceneId: {selected.sceneId} · start: {selected.start}s · duration: {selected.duration}s
                   </div>
                </div>
            ) : (
                <div className="text-center text-slate-500 text-sm py-3 border border-dashed border-white/5 rounded-xl">
                    Hacé click en un clip para editarlo
              </div>
            )}

            {/* Export panel */}
            <ExportPanel
    projectId={projectId}
    project={project ?? null}
    timeline={state.timeline}
    scenes={scenes.map(s => ({ id: s.id, projectId: s.projectId, durationSec: s.durationSec, videoAssetId: s.videoAssetId, visualPrompt: s.visualPrompt }))}
    showToast={showToast}
/>
      </div>
    );
}

// ── Subcomponents ────────────────────────────────────────────────────────

interface RulerProps {
    timeline: Timeline;
    scenes: Scene[];
    currentTimeSec: number;
    selectedClipId: string | null;
    draggingIndex: number | null;
    onSeek: (t: number) => void;
    onSelect: (id: string) => void;
    onDragStart: (i: number) => void;
    onDragOver: (e: React.DragEvent) => void;
    onDrop: (i: number) => void;
}

function TimelineRuler({
    timeline, scenes, currentTimeSec, selectedClipId, draggingIndex,
    onSeek, onSelect, onDragStart, onDragOver, onDrop,
}: RulerProps) {
    const dur = Math.max(1, timeline.duration);
    const tickEvery = dur <= 20 ? 5 : dur <= 60 ? 10 : 30;
    const ticks: number[] = [];
    for (let t = 0; t <= dur; t += tickEvery) ticks.push(t);

    const sceneById = new Map<string, Scene>();
    for (const s of scenes) sceneById.set(s.id, s);

    return (
        <div className="space-y-2" data-testid="timeline-ruler">
            {/* Tick row */}
            <div className="flex justify-between text-[10px] font-mono text-slate-500 px-1">
                {ticks.map(t => (
                    <button
                        key={t}
                        onClick={() => onSeek(t)}
                        className="hover:text-emerald-400"
                    >
                        {t}s
                  </button>
                ))}
          </div>

            {/* Clip row */}
            <div className="flex h-14 bg-slate-950 rounded-xl overflow-hidden border border-white/5 relative">
                {timeline.clips.map((clip, idx) => {
                    const left = (clip.start / dur) * 100;
                    const width = (clip.duration / dur) * 100;
                    const isSelected = selectedClipId === clip.id;
                    const isDragging = draggingIndex === idx;
                    const scene = sceneById.get(clip.sceneId);
                    const status = scene ? getSceneVideoStatus(scene) : 'pending';
                    return (
                        <div
                            key={clip.id}
                            draggable
                            onDragStart={() => onDragStart(idx)}
                            onDragOver={onDragOver}
                            onDrop={() => onDrop(idx)}
                            onClick={() => onSelect(clip.id)}
                            className={`absolute top-0 bottom-0 flex items-center justify-center text-[10px] font-mono font-bold cursor-pointer transition-all overflow-hidden border-r border-slate-900
                                ${isSelected
                                    ? 'bg-gradient-to-r from-emerald-500 to-cyan-600 text-white ring-2 ring-emerald-400 ring-offset-2 ring-offset-slate-950 z-10'
                                    : 'bg-slate-800 hover:bg-slate-700 text-slate-200'}
                                ${isDragging ? 'opacity-40' : ''}`}
                            style={{ left: `${left}%`, width: `${width}%` }}
                            data-clip-id={clip.id}
                            data-testid={`clip-${idx}`}
                            data-clip-status={status}
                        >
                            <div className="flex items-center gap-1 px-1 truncate">
                                <StatusIcon status={status} />
                                <span className="truncate">
                                    {clip.sceneId.slice(0, 6)} · {clip.duration}s
                               </span>
                          </div>
                      </div>
                    );
                })}
                {/* Playhead */}
                <div
                    className="absolute top-0 bottom-0 w-0.5 bg-emerald-400 pointer-events-none z-20 shadow-[0_0_8px_rgba(16,185,129,0.7)]"
                    style={{ left: `${(currentTimeSec / dur) * 100}%` }}
                />
          </div>
      </div>
    );
}

function StatusIcon({ status }: { status: 'pending' | 'generating' | 'ready' | 'failed' }) {
    switch (status) {
        case 'pending':    return <FaCircle className="text-slate-400 shrink-0" />;
        case 'generating': return <FaSpinner className="text-amber-400 animate-spin shrink-0" />;
        case 'ready':      return <FaCheckCircle className="text-emerald-400 shrink-0" />;
        case 'failed':     return <FaExclamationTriangle className="text-red-400 shrink-0" />;
    }
}

function StatusLegend({ scenes }: { scenes: Scene[] }) {
    const counts = { pending: 0, generating: 0, ready: 0, failed: 0 };
    for (const s of scenes) {
        counts[getSceneVideoStatus(s)]++;
    }
    return (
        <div className="flex items-center gap-4 text-xs text-slate-400 px-1" data-testid="status-legend">
            <span className="flex items-center gap-1.5"><FaCheckCircle className="text-emerald-400" /> Ready ({counts.ready})</span>
            <span className="flex items-center gap-1.5"><FaClock className="text-amber-400" /> Generating ({counts.generating})</span>
            <span className="flex items-center gap-1.5"><FaCircle className="text-slate-400" /> Pending ({counts.pending})</span>
            <span className="flex items-center gap-1.5"><FaExclamationTriangle className="text-red-400" /> Failed ({counts.failed})</span>
       </div>
    );
}

// -- Export panel --------------------------------------------------------
interface ExportState {
    jobId: string | null;
    status: 'idle' | 'queued' | 'processing' | 'completed' | 'failed';
    error: string | null;
    outputUrl: string | null;
}

interface ExportPanelProps {
    projectId: string;
    project: { id: string; userId: string; name: string; format: string } | null;
    timeline: { id: string; projectId: string; duration: number; clips: any[]; aspectRatio: string; fps: number; createdAt: string; updatedAt: string };
    scenes: { id: string; projectId: string; durationSec: number; videoAssetId?: string; visualPrompt: string }[];
    showToast: (type: 'success' | 'error' | 'info' | 'warning', message: string, duration?: number) => void;
}

function ExportPanel({ projectId, project, timeline, scenes, showToast }: ExportPanelProps) {
    const [state, setState] = useState<ExportState>({
        jobId: null, status: 'idle', error: null, outputUrl: null,
    });
    const [submitting, setSubmitting] = useState(false);

    // Poll job status while queued/processing.
    useEffect(() => {
        if (!state.jobId) return;
        if (state.status !== 'queued' && state.status !== 'processing') return;
        let cancelled = false;
        const tick = async () => {
            try {
                const res = await fetch(`/api/studio/jobs/${state.jobId}`);
                if (!res.ok) return;
                const data = await res.json();
                if (cancelled) return;
                const status = data.job?.status as string | undefined;
                if (status === 'completed') {
                    setState(s => ({ ...s, status: 'completed', outputUrl: data.job?.outputUrl ?? s.outputUrl }));
                } else if (status === 'failed') {
                    setState(s => ({ ...s, status: 'failed', error: data.job?.error ?? 'unknown error' }));
                } else if (status === 'processing') {
                    setState(s => ({ ...s, status: 'processing' }));
                }
            } catch { /* keep polling */ }
        };
        tick();
        const interval = setInterval(tick, 2000);
        return () => { cancelled = true; clearInterval(interval); };
    }, [state.jobId, state.status]);

    async function handleExport() {
        if (!project) {
            showToast('error', 'Proyecto no disponible');
            return;
        }
        setSubmitting(true);
        setState({ jobId: null, status: 'idle', error: null, outputUrl: null });
        try {
            const res = await fetch(`/api/studio/projects/${projectId}/export`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ project, timeline, scenes })
            });
            const data = await res.json();
            if (!res.ok) {
                setState({ jobId: null, status: 'failed', error: data.error ?? `HTTP ${res.status}`, outputUrl: null });
                return;
            }
            setState({ jobId: data.jobId, status: 'queued', error: null, outputUrl: null });
        } catch (e: unknown) {
            setState({ jobId: null, status: 'failed', error: e instanceof Error ? e.message : 'failed', outputUrl: null });
        } finally {
            setSubmitting(false);
        }
    }

    return (
        <div className="bg-slate-950 border border-white/10 rounded-xl p-4 space-y-3" data-testid="export-panel">
            <div className="flex items-center justify-between gap-4 flex-wrap">
                <div>
                    <div className="text-xs text-slate-400 uppercase tracking-wider font-bold">Export MP4</div>
                    <div className="text-sm text-slate-300 mt-1">{describeExportStatus(state)}</div>
               </div>
                <button
                    onClick={handleExport}
                    disabled={submitting || state.status === 'queued' || state.status === 'processing'}
                    className="flex items-center gap-2 px-5 py-2 rounded-lg bg-gradient-to-r from-purple-500 to-indigo-600 text-white text-sm font-bold shadow-lg hover:brightness-110 disabled:opacity-50"
                >
                    {submitting ? <FaSpinner className="animate-spin" /> : <FaDownload />}
                    {submitting ? 'Iniciando...' : 'Exportar MP4'}
               </button>
           </div>
            {state.error && (
                <div className="text-sm text-red-300 bg-red-500/10 border border-red-500/30 rounded-lg p-3 whitespace-pre-line">
                    {state.error}
               </div>
            )}
            {state.status === 'completed' && state.outputUrl && (
                <a
                    href={state.outputUrl}
                    download
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 hover:bg-emerald-500/30 text-sm font-bold"
                >
                    <FaDownload /> Descargar final.mp4
               </a>
            )}
       </div>
    );
}

function describeExportStatus(state: ExportState): string {
    if (state.status === 'idle') return 'Listo para exportar';
    if (state.status === 'queued') return 'Queued...';
    if (state.status === 'processing') return 'Processing...';
    if (state.status === 'completed') return 'Completed';
    if (state.status === 'failed') return 'Failed';
    return '';
}