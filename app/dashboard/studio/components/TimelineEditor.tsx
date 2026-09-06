'use client';

import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import {
    FaPlay, FaPause, FaSave, FaTrash, FaArrowLeft, FaArrowRight, FaFilm, FaSpinner, FaTimes, FaSync, FaCheckCircle, FaExclamationTriangle, FaCircle, FaDownload, FaCopy, FaPlus, FaEdit, FaArrowsAltH, FaGripLines,
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

// Zoom levels
const ZOOM_LEVELS = [25, 50, 100, 200];
const DEFAULT_ZOOM = 100;

export default function TimelineEditor({ projectId, scenes, aspectRatio, onClose, project }: TimelineEditorProps) {
    const [state, dispatch] = useReducer(reducer, initialState);
    const videoRef = useRef<HTMLVideoElement | null>(null);
    const [draggingIndex, setDraggingIndex] = useState<number | null>(null);
    const [zoomLevel, setZoomLevel] = useState<number>(DEFAULT_ZOOM);
    const [showTrimHandles, setShowTrimHandles] = useState<boolean>(true);
    const [hoveredClipId, setHoveredClipId] = useState<string | null>(null);
    const [resizeDirection, setResizeDirection] = useState<'start' | 'end' | null>(null);
    const { showToast } = useToast();
    const fileRefsRef = useRef<Map<string, File>>(new Map());

    // ── handleClipResize function ───────────────────────────────────────
    const handleClipResize = useCallback((clipId: string, direction: 'start' | 'end', newDuration: number) => {
        if (newDuration < 1) return;
        dispatch({ type: 'UPDATE_CLIP', clipId, patch: { duration: Math.floor(newDuration) } });
    }, []);

    // ── onSave function (moved here to be available for useEffects) ─────
    const onSave = useCallback(() => {
        if (!state.timeline) return;
        dispatch({ type: 'SAVE_START' });
        try {
            const timelineStore = getTimelineStore();
            const existing = timelineStore.getTimeline(projectId);
            let saved: Timeline;
            if (existing) {
                saved = timelineStore.upsertTimeline({ ...state.timeline, updatedAt: new Date().toISOString() });
            } else {
                saved = timelineStore.upsertTimeline({ ...state.timeline, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
            }
            dispatch({ type: 'SAVE_SUCCESS', timeline: saved });
            showToast('success', 'Proyecto guardado');
        } catch (e: unknown) {
            dispatch({ type: 'SAVE_FAIL', error: e instanceof Error ? e.message : 'save failed' });
            showToast('error', 'Error al guardar');
        }
    }, [projectId, state.timeline]);

    // ── Autosave timer ────────────────────────────────────────────────
    useEffect(() => {
        if (!state.dirty || !state.timeline) return;
        const timer = setTimeout(() => {
            onSave();
        }, 2000);
        return () => clearTimeout(timer);
    }, [state.dirty, state.timeline, onSave]);

    // ── Listen for add-media-to-timeline events ───────────────────────────
    useEffect(() => {
        const handleAddMedia = (e: CustomEvent) => {
            const { projectId: eventProjectId, clip } = e.detail;
            if (eventProjectId === projectId) {
                dispatch({ type: 'ADD_MEDIA_CLIP', clip });
            }
        };
        window.addEventListener('add-media-to-timeline', handleAddMedia as EventListener);
        return () => window.removeEventListener('add-media-to-timeline', handleAddMedia as EventListener);
    }, [projectId]);

    // ── Keyboard shortcuts ────────────────────────────────────────────
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
            // Zoom shortcuts
            if (e.key === '=' || e.key === '+') {
                e.preventDefault();
                const nextZoom = Math.min(200, zoomLevel + 25);
                setZoomLevel(nextZoom);
            }
            if (e.key === '-') {
                e.preventDefault();
                const nextZoom = Math.max(25, zoomLevel - 25);
                setZoomLevel(nextZoom);
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [state.isPlaying, zoomLevel, onSave]);

    // ── Load timeline on mount ────────────────────────────────────────
    useEffect(() => {
        let cancelled = false;
        (async () => {
            dispatch({ type: 'LOAD_START' });
            try {
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

    // ── Playback tick (rAF) ───────────────────────────────────────────
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
    }, [state.isPlaying, state.timeline?.id]);

    // ── Video element sync ──────────────────────────────────────────────
    const currentClip = getCurrentClip(state);
    const prevClipRef = useRef<TimelineClip | null>(null);
    const loadedMetadataHandlerRef = useRef<((e: Event) => void) | null>(null);
    
    // Handle clip change - seek to sourceStart
    useEffect(() => {
        const v = videoRef.current;
        if (!v) return;
        if (currentClip?.sourceUrl) {
            if (v.src !== currentClip.sourceUrl) {
                v.src = currentClip.sourceUrl;
            }
            // When clip changes, wait for metadata then seek to sourceStart
            const handleLoadedMetadata = () => {
                const sourceStart = currentClip.sourceStart ?? 0;
                if (v.currentTime !== sourceStart) {
                    v.currentTime = sourceStart;
                }
                v.removeEventListener('loadedmetadata', handleLoadedMetadata);
            };
            loadedMetadataHandlerRef.current = handleLoadedMetadata;
            if (v.readyState >= 1) {
                // Metadata already loaded
                const sourceStart = currentClip.sourceStart ?? 0;
                v.currentTime = sourceStart;
            } else {
                v.addEventListener('loadedmetadata', handleLoadedMetadata);
            }
        } else if (v.src) {
            v.removeAttribute('src');
            v.load();
        }
        return () => {
            if (loadedMetadataHandlerRef.current) {
                v.removeEventListener('loadedmetadata', loadedMetadataHandlerRef.current);
            }
        };
    }, [currentClip?.id, currentClip?.sourceUrl, currentClip?.sourceStart]);

    // Handle playback sync and sourceEnd detection
    useEffect(() => {
        const v = videoRef.current;
        if (!v || !currentClip) return;
        
        const sourceStart = currentClip.sourceStart ?? 0;
        const sourceEnd = currentClip.sourceEnd ?? currentClip.duration;
        const clipEndTime = currentClip.start + (sourceEnd - sourceStart);
        
        // Calculate the correct video time based on timeline position
        const timelinePosInClip = state.currentTimeSec - currentClip.start;
        const targetVideoTime = sourceStart + timelinePosInClip;
        
        // Sync video time
        if (Math.abs(v.currentTime - targetVideoTime) > 0.25) {
            v.currentTime = targetVideoTime;
        }
        
        // Check if we've reached the end of this clip's trim range
        const atClipEnd = targetVideoTime >= sourceEnd - 0.1;
        const atTimelineEnd = state.currentTimeSec >= clipEndTime - 0.1;
        
        if (state.isPlaying && v.paused) {
            v.play().catch(() => undefined);
        }
        if (!state.isPlaying && !v.paused) {
            v.pause();
        }
        
        // Auto-advance to next clip when sourceEnd is reached
        if (state.isPlaying && atClipEnd && !atTimelineEnd) {
            // The TICK will naturally advance currentTimeSec, which will change currentClip
            // This is handled by the reducer's TICK action and getCurrentClip
        }
    }, [state.currentTimeSec, state.isPlaying, currentClip?.id, currentClip?.sourceStart, currentClip?.sourceEnd, currentClip?.duration, currentClip?.start]);

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

    const onTransitionEdit = useCallback((clipId: string, value: 'cut' | 'fade' | 'fade-black' | 'dissolve') => {
        dispatch({ type: 'UPDATE_CLIP', clipId, patch: { transition: value } });
    }, []);

    const onTransitionDurationEdit = useCallback((clipId: string, duration: number) => {
        dispatch({ type: 'UPDATE_CLIP', clipId, patch: { transitionDuration: duration } });
    }, []);

    const onDelete = useCallback((clipId: string) => {
        if (!state.timeline) return;
        if (!confirm('¿Eliminar este clip?')) return;
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
        if (!clip || !clip.sceneId) return;

        const timelineStore = getTimelineStore();
        const sceneStore = getSceneStore();

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

        onRebuildFromScenes();
        showToast('success', `Clip duplicado: ${newScene.title ?? 'Sin título'}`);
    }, [projectId, state.timeline, scenes, aspectRatio]);

    const onRebuildFromScenes = useCallback(() => {
        if (scenes.length === 0) return;
        const fresh = buildTimelineFromProjectScenes({
            timelineId: state.timeline?.id ?? `tl_${projectId}`,
            projectId,
            scenes,
            aspectRatio,
        });
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

            {/* Zoom controls */}
            <div className="flex items-center gap-2 bg-slate-950 rounded-xl p-2 border border-white/5">
                <span className="text-xs text-slate-400 font-mono">Zoom:</span>
                {ZOOM_LEVELS.map((zoom) => (
                    <button
                        key={zoom}
                        onClick={() => setZoomLevel(zoom)}
                        className={`px-2 py-1 rounded text-sm font-bold ${
                            zoom === zoomLevel
                                ? 'bg-emerald-500 text-white shadow'
                                : 'text-slate-400 hover:bg-slate-700 hover:text-white'}
                       `}
                    >
                        {zoom}%
                    </button>
                ))}
                <button
                    onClick={() => setZoomLevel(DEFAULT_ZOOM)}
                    className="px-2 py-1 rounded text-sm text-slate-400 hover:bg-slate-700"
                    title="Zoom 100%"
                >
                    1:1
                </button>
            </div>

            {/* Preview */}
            <div className={`aspect-video bg-black rounded-xl overflow-hidden border border-white/5 relative ${zoomLevel !== 100 ? 'scale-${zoomLevel / 100}' : ''}`}>
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
                {/* Resize handle preview */}
                {hoveredClipId && resizeDirection && (
                    <div className="absolute inset-0 cursor-row-resize bg-black/50 data-[resize='horizontal']:cursor-ew-resize data-[resize='vertical']:cursor-ns-resize" />
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

            {/* Ruler with trim handles */}
            <TimelineRuler
                timeline={t}
                scenes={scenes}
                currentTimeSec={state.currentTimeSec}
                selectedClipId={state.selectedClipId}
                draggingIndex={draggingIndex}
                zoomLevel={zoomLevel}
                onSeek={onSeekTo}
                onSelect={onSelect}
                onDragStart={onDragStart}
                onDragOver={onDragOver}
                onDrop={onDrop}
                onHoveredClipChange={setHoveredClipId}
                onResizeStart={setResizeDirection}
                onResize={handleClipResize}
                showTrimHandles={showTrimHandles}
                hoveredClipId={hoveredClipId}
                resizeDirection={resizeDirection}
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
                                max={300}
                                value={selected.duration}
                                onChange={e => onDurationEdit(selected.id, e.target.value)}
                                className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-1.5 text-white focus:border-emerald-500/50 outline-none"
                            />
                        </div>
                        {selected.assetId && (
                            <>
                                <div>
                                    <label className="block text-xs text-slate-500 mb-1">IN (s)</label>
                                    <input
                                        type="number"
                                        min={0}
                                        max={selected.sourceEnd ? selected.sourceEnd - 0.1 : 300}
                                        step={0.1}
                                        value={selected.sourceStart ?? 0}
                                        onChange={e => dispatch({ type: 'UPDATE_CLIP', clipId: selected.id, patch: { sourceStart: Math.max(0, Number(e.target.value)) } })}
                                        className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-1.5 text-white focus:border-emerald-500/50 outline-none"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs text-slate-500 mb-1">OUT (s)</label>
                                    <input
                                        type="number"
                                        min={(selected.sourceStart ?? 0) + 0.1}
                                        max={300}
                                        step={0.1}
                                        value={selected.sourceEnd ?? selected.duration}
                                        onChange={e => dispatch({ type: 'UPDATE_CLIP', clipId: selected.id, patch: { sourceEnd: Math.max((selected.sourceStart ?? 0) + 0.1, Number(e.target.value)) } })}
                                        className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-1.5 text-white focus:border-emerald-500/50 outline-none"
                                    />
                                </div>
                                <div className="text-xs text-slate-400">
                                    Duración efectiva: {(selected.sourceEnd ?? selected.duration) - (selected.sourceStart ?? 0)}s
                                </div>
                            </>
                        )}
                        <div>
                            <label className="block text-xs text-slate-500 mb-1">Transición</label>
                            <select
                                value={selected.transition ?? 'cut'}
                                onChange={e => onTransitionEdit(selected.id, e.target.value as 'cut' | 'fade' | 'fade-black' | 'dissolve')}
                                className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-1.5 text-white focus:border-emerald-500/50 outline-none"
                            >
                                <option value="cut">Cut</option>
                                <option value="fade">Fade</option>
                                <option value="fade-black">Fade to Black</option>
                                <option value="dissolve">Dissolve</option>
                            </select>
                        </div>
                        <div>
                            <label className="block text-xs text-slate-500 mb-1">Duración transición (s)</label>
                            <input
                                type="number"
                                min={0.1}
                                max={5}
                                step={0.1}
                                value={selected.transitionDuration ?? 0.5}
                                onChange={e => onTransitionDurationEdit(selected.id, Number(e.target.value))}
                                className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-1.5 text-white focus:border-emerald-500/50 outline-none"
                            />
                        </div>
                        <div>
                            <label className="block text-xs text-slate-500 mb-1">Volumen</label>
                            <input
                                type="number"
                                min={0}
                                max={1}
                                step={0.1}
                                value={selected.volume ?? 1}
                                onChange={e => dispatch({ type: 'UPDATE_CLIP', clipId: selected.id, patch: { volume: Number(e.target.value) } })}
                                className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-1.5 text-white focus:border-emerald-500/50 outline-none"
                            />
                        </div>
                        {selected.type === 'audio' && (
                            <div>
                                <label className="block text-xs text-slate-500 mb-1">Fade in (s)</label>
                                <input
                                    type="number"
                                    min={0}
                                    step={0.1}
                                    value={selected.fadeIn ?? 0}
                                    onChange={e => dispatch({ type: 'UPDATE_CLIP', clipId: selected.id, patch: { fadeIn: Number(e.target.value) } })}
                                    className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-1.5 text-white focus:border-emerald-500/50 outline-none"
                                />
                                <label className="block text-xs text-slate-500 mb-1">Fade out (s)</label>
                                <input
                                    type="number"
                                    min={0}
                                    step={0.1}
                                    value={selected.fadeOut ?? 0}
                                    onChange={e => dispatch({ type: 'UPDATE_CLIP', clipId: selected.id, patch: { fadeOut: Number(e.target.value) } })}
                                    className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-1.5 text-white focus:border-emerald-500/50 outline-none"
                                />
                            </div>
                        )}
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
                zoomLevel={zoomLevel}
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
    zoomLevel: number;
    onSeek: (t: number) => void;
    onSelect: (id: string) => void;
    onDragStart: (i: number) => void;
    onDragOver: (e: React.DragEvent) => void;
    onDrop: (i: number) => void;
    onHoveredClipChange: (id: string | null) => void;
    onResizeStart: (direction: 'start' | 'end' | null) => void;
    onResize: (clipId: string, direction: 'start' | 'end', newDuration: number) => void;
    showTrimHandles: boolean;
    hoveredClipId: string | null;
    resizeDirection: 'start' | 'end' | null;
}

function TimelineRuler({
    timeline, scenes, currentTimeSec, selectedClipId, draggingIndex,
    zoomLevel, onSeek, onSelect, onDragStart, onDragOver, onDrop,
    onHoveredClipChange, onResizeStart, onResize, showTrimHandles,
    hoveredClipId, resizeDirection,
}: RulerProps) {
    const dur = Math.max(1, timeline.duration);
    const tickEvery = dur <= 20 ? 5 : dur <= 60 ? 10 : 30;
    const ticks: number[] = [];
    for (let t = 0; t <= dur; t += tickEvery) ticks.push(t);

    const sceneById = new Map<string, Scene>();
    for (const s of scenes) sceneById.set(s.id, s);

    // Calculate scaled dimensions based on zoom
    const scaledDur = dur * (zoomLevel / 100);
    const scaledTickEvery = tickEvery * (zoomLevel / 100);

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
            <div className={`flex h-14 bg-slate-950 rounded-xl overflow-hidden border border-white/5 relative ${zoomLevel >= 200 ? 'scale-2' : zoomLevel <= 25 ? 'scale-0.5' : ''}`}>
                {timeline.clips.map((clip, idx) => {
                    const left = (clip.start / dur) * 100;
                    const width = (clip.duration / dur) * 100;
                    const isSelected = selectedClipId === clip.id;
                    const isDragging = draggingIndex === idx;
                    const isHovered = hoveredClipId === clip.id;
                    const isResizing = resizeDirection !== null;
                    const scene = clip.sceneId ? sceneById.get(clip.sceneId) : undefined;
                    const status = scene ? getSceneVideoStatus(scene) : 'pending';
                    const type = determineClipType(clip);

                    return (
                        <div
                            key={clip.id}
                            draggable
                            onDragStart={() => onDragStart(idx)}
                            onDragOver={onDragOver}
                            onDrop={() => onDrop(idx)}
                            onClick={() => onSelect(clip.id)}
                            onMouseEnter={() => onHoveredClipChange(clip.id)}
                            onMouseLeave={() => onHoveredClipChange(null)}
                            className={`absolute top-0 bottom-0 flex items-center justify-center text-[10px] font-mono font-bold cursor-pointer transition-all overflow-hidden border-r border-slate-900
                                ${isSelected
                                    ? 'bg-gradient-to-r from-emerald-500 to-cyan-600 text-white ring-2 ring-emerald-400 ring-offset-2 ring-offset-slate-950 z-10'
                                    : isHovered && showTrimHandles
                                        ? 'bg-slate-700'
                                        : 'bg-slate-800 hover:bg-slate-700 text-slate-200'}
                                ${isDragging ? 'opacity-40' : ''}
                                ${isResizing ? 'border-2 border-emerald-500' : ''}`}
                            style={{ left: `${left}%`, width: `${width}%` }}
                            data-clip-id={clip.id}
                            data-testid={`clip-${idx}`}
                            data-clip-status={status}
                            data-clip-type={type}
                        >
                            <div className="flex items-center gap-1 px-1 truncate">
                                <StatusIcon status={status} />
                                <span className="truncate">
                                    {(clip.sceneId ? clip.sceneId.slice(0, 6) : clip.assetId ? clip.assetId.slice(0, 6) : clip.id.slice(0, 6))} · {clip.duration}s
                                </span>
                            </div>
                            {/* Trim handles - only show when zoomed in enough */}
                            {showTrimHandles && zoomLevel >= 50 && isHovered && !isSelected && !isDragging && !isResizing && (
                                <div className="absolute top-1 bottom-1 left-0 w-1.5 bg-emerald-500 cursor-col-resize opacity-0 hover:opacity-100 transition-opacity">
                                    <svg className="w-3 h-3 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                                    </svg>
                                </div>
                            )}
                            {showTrimHandles && zoomLevel >= 50 && isHovered && !isSelected && !isDragging && !isResizing && (
                                <div className="absolute top-1 bottom-1 right-0 w-1.5 bg-emerald-500 cursor-col-resize opacity-0 hover:opacity-100 transition-opacity">
                                    <svg className="w-3 h-3 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                                    </svg>
                                </div>
                            )}
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

function determineClipType(clip: TimelineClip): 'video' | 'audio' | 'image' {
    // Simple heuristic based on sourceUrl or metadata
    if (clip.sourceUrl?.includes('.mp3') || clip.sourceUrl?.includes('.wav') || clip.sourceUrl?.includes('.m4a')) {
        return 'audio';
    }
    if (clip.sourceUrl?.includes('.mp4') || clip.sourceUrl?.includes('.mov') || clip.sourceUrl?.includes('.webm')) {
        return 'video';
    }
    return 'image';
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
            <span className="flex items-center gap-1.5"><FaSpinner className="text-amber-400 animate-spin" /> Generating ({counts.generating})</span>
            <span className="flex items-center gap-1.5"><FaCircle className="text-slate-400" /> Pending ({counts.pending})</span>
            <span className="flex items-center gap-1.5"><FaExclamationTriangle className="text-red-400" /> Failed ({counts.failed})</span>
        </div>
    );
}

// -- Export panel --------------------------------------------------------
import { exportTimelineToMP4, ExportProgress } from '@/lib/video/ffmpeg-wasm-export';

interface ExportState {
    status: 'idle' | 'loading' | 'writing' | 'processing' | 'completed' | 'error';
    progress: number;
    message: string;
    error: string | null;
    outputUrl: string | null;
}

interface ExportPanelProps {
    projectId: string;
    project: { id: string; userId: string; name: string; format: string } | null;
    timeline: { id: string; projectId: string; duration: number; clips: any[]; aspectRatio: string; fps: number; createdAt: string; updatedAt: string };
    scenes: { id: string; projectId: string; durationSec: number; videoAssetId?: string; visualPrompt: string }[];
    showToast: (type: 'success' | 'error' | 'info' | 'warning', message: string, duration?: number) => void;
    zoomLevel: number;
}

function ExportPanel({ projectId, project, timeline, scenes, showToast, zoomLevel }: ExportPanelProps) {
    const [state, setState] = useState<ExportState>({
        status: 'idle', progress: 0, message: '', error: null, outputUrl: null,
    });
    const [submitting, setSubmitting] = useState(false);

    async function handleExport() {
        if (!project) {
            showToast('error', 'Proyecto no disponible');
            return;
        }
        if (timeline.clips.length === 0) {
            showToast('error', 'El timeline está vacío. Agrega clips antes de exportar.');
            return;
        }

        setSubmitting(true);
        setState({ status: 'loading', progress: 0, message: 'Iniciando...', error: null, outputUrl: null });

        try {
            const result = await exportTimelineToMP4(
                timeline as any, // Cast to Timeline type
                (progress) => {
                    setState(prev => ({
                        ...prev,
                        status: progress.stage,
                        progress: progress.progress,
                        message: progress.message,
                    }));
                }
            );

            if (result.success && result.blob) {
                const url = URL.createObjectURL(result.blob);
                setState({ 
                    status: 'completed', 
                    progress: 100, 
                    message: 'Exportación completada', 
                    error: null, 
                    outputUrl: url 
                });
                showToast('success', 'Exportación completada');
            } else {
                setState({ 
                    status: 'error', 
                    progress: 0, 
                    message: '', 
                    error: result.error ?? 'Error desconocido', 
                    outputUrl: null 
                });
                showToast('error', `Exportación fallida: ${result.error}`);
            }
        } catch (e: unknown) {
            const message = e instanceof Error ? e.message : 'Error desconocido';
            setState({ 
                status: 'error', 
                progress: 0, 
                message: '', 
                error: message, 
                outputUrl: null 
            });
            showToast('error', `Error en la exportación: ${message}`);
        } finally {
            setSubmitting(false);
        }
    }

    return (
        <div className="bg-slate-950 border border-white/10 rounded-xl p-4 space-y-3" data-testid="export-panel">
            <div className="flex items-center justify-between gap-4 flex-wrap">
                <div>
                    <div className="text-xs text-slate-400 uppercase tracking-wider font-bold">Export MP4 (FFmpeg WASM)</div>
                    <div className="text-sm text-slate-300 mt-1">{state.message || (state.status === 'idle' ? 'Listo para exportar' : state.status)}</div>
               </div>
                <button
                    onClick={handleExport}
                    disabled={submitting || state.status === 'loading' || state.status === 'writing' || state.status === 'processing'}
                    className="flex items-center gap-2 px-5 py-2 rounded-lg bg-gradient-to-r from-purple-500 to-indigo-600 text-white text-sm font-bold shadow-lg hover:brightness-110 disabled:opacity-50"
                >
                    {submitting ? <FaSpinner className="animate-spin" /> : <FaDownload />}
                    {submitting ? 'Exportando...' : 'Exportar MP4'}
               </button>
            </div>
            
            {state.status !== 'idle' && state.status !== 'completed' && state.status !== 'error' && (
                <div className="space-y-2">
                    <div className="w-full h-2 bg-slate-800 rounded-full overflow-hidden">
                        <div 
                            className="h-full bg-gradient-to-r from-emerald-500 to-cyan-600 transition-all duration-300"
                            style={{ width: `${state.progress}%` }}
                        />
                    </div>
                    <div className="text-xs text-slate-400 font-mono">{state.progress}%</div>
                </div>
            )}
            
            {state.error && (
                <div className="text-sm text-red-300 bg-red-500/10 border border-red-500/30 rounded-lg p-3 whitespace-pre-line">
                    {state.error}
               </div>
            )}
            
            {state.status === 'completed' && state.outputUrl && (
                <a
                    href={state.outputUrl}
                    download={`${project?.name || 'video'}.mp4`}
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 hover:bg-emerald-500/30 text-sm font-bold"
                >
                    <FaDownload /> Descargar final.mp4
               </a>
            )}
        </div>
    );
}