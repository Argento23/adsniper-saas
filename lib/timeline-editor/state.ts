/**
 * Pure state reducer for the TimelineEditor.
 *
 * Extracted from the React component so the editor's logic is testable
 * without a DOM. All actions return a new state object; the reducer
 * never mutates.
 */

import { Timeline, TimelineClip, computeTotalDuration } from '@/lib/projects/timeline';

export interface TimelineEditorState {
    timeline: Timeline | null;
    selectedClipId: string | null;
    isPlaying: boolean;
    currentTimeSec: number;
    dirty: boolean;
    saving: boolean;
    error: string | null;
    loading: boolean;
}

export const initialState: TimelineEditorState = {
    timeline: null,
    selectedClipId: null,
    isPlaying: false,
    currentTimeSec: 0,
    dirty: false,
    saving: false,
    error: null,
    loading: true,
};

export type TimelineEditorAction =
    | { type: 'LOAD_START' }
    | { type: 'LOAD_SUCCESS'; timeline: Timeline | null }
    | { type: 'LOAD_FAIL'; error: string }
    | { type: 'SELECT'; clipId: string | null }
    | { type: 'REORDER'; fromIndex: number; toIndex: number }
    | { type: 'UPDATE_CLIP'; clipId: string; patch: Partial<TimelineClip> }
    | { type: 'DELETE_CLIP'; clipId: string }
    | { type: 'ADD_MEDIA_CLIP'; clip: TimelineClip }
    | { type: 'PLAY' }
    | { type: 'PAUSE' }
    | { type: 'SEEK'; timeSec: number }
    | { type: 'TICK'; timeSec: number }
    | { type: 'SAVE_START' }
    | { type: 'SAVE_SUCCESS'; timeline: Timeline }
    | { type: 'SAVE_FAIL'; error: string }
    | { type: 'ERROR'; error: string | null };

function clamp(n: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, n));
}

function withClipsRecomputed(timeline: Timeline, clips: TimelineClip[]): Timeline {
    // Rebuild sequential starts preserving the explicit order of `clips`
    // (does NOT sort — caller has already chosen the order, e.g. via
    // drag-to-reorder).
    let acc = 0;
    const next: TimelineClip[] = clips.map((clip) => {
        const updated: TimelineClip = { ...clip, start: acc };
        acc += clip.duration;
        return updated;
    });
    return {
        ...timeline,
        clips: next,
        duration: computeTotalDuration(next),
    };
}

export function reducer(state: TimelineEditorState, action: TimelineEditorAction): TimelineEditorState {
    switch (action.type) {
        case 'LOAD_START':
            return { ...state, loading: true, error: null };
        case 'LOAD_SUCCESS':
            return {
                ...state,
                loading: false,
                timeline: action.timeline,
                selectedClipId: null,
                currentTimeSec: 0,
                isPlaying: false,
                dirty: false,
                error: null,
            };
        case 'LOAD_FAIL':
            return { ...state, loading: false, error: action.error };
        case 'SELECT':
            return { ...state, selectedClipId: action.clipId };
        case 'REORDER': {
            if (!state.timeline) return state;
            const clips = [...state.timeline.clips];
            if (action.fromIndex < 0 || action.fromIndex >= clips.length) return state;
            if (action.toIndex < 0 || action.toIndex >= clips.length) return state;
            const [moved] = clips.splice(action.fromIndex, 1);
            clips.splice(action.toIndex, 0, moved);
            return {
                ...state,
                timeline: withClipsRecomputed(state.timeline, clips),
                dirty: true,
            };
        }
        case 'UPDATE_CLIP': {
            if (!state.timeline) return state;
            const idx = state.timeline.clips.findIndex(c => c.id === action.clipId);
            if (idx === -1) return state;
            const merged: TimelineClip = {
                ...state.timeline.clips[idx],
                ...action.patch,
                id: state.timeline.clips[idx].id,
            };
            const clips = [...state.timeline.clips];
            clips[idx] = merged;
            return {
                ...state,
                timeline: withClipsRecomputed(state.timeline, clips),
                dirty: true,
            };
        }
        case 'DELETE_CLIP': {
            if (!state.timeline) return state;
            const clips = state.timeline.clips.filter(c => c.id !== action.clipId);
            if (clips.length === state.timeline.clips.length) return state;
            const next = withClipsRecomputed(state.timeline, clips);
            return {
                ...state,
                timeline: next,
                selectedClipId: state.selectedClipId === action.clipId ? null : state.selectedClipId,
                dirty: true,
            };
        }
        case 'ADD_MEDIA_CLIP': {
            if (!state.timeline) return state;
            // Compute start time at the end of existing clips
            const newStart = state.timeline.duration;
            const newClip: TimelineClip = {
                ...action.clip,
                start: newStart,
                // If no sourceStart/sourceEnd provided, default to full asset duration
                sourceStart: action.clip.sourceStart ?? 0,
                sourceEnd: action.clip.sourceEnd ?? action.clip.duration,
            };
            const clips = [...state.timeline.clips, newClip];
            return {
                ...state,
                timeline: withClipsRecomputed(state.timeline, clips),
                dirty: true,
            };
        }
        case 'PLAY':
            return { ...state, isPlaying: true };
        case 'PAUSE':
            return { ...state, isPlaying: false };
        case 'SEEK': {
            const max = state.timeline?.duration ?? 0;
            return { ...state, currentTimeSec: clamp(action.timeSec, 0, max) };
        }
        case 'TICK': {
            const max = state.timeline?.duration ?? 0;
            const next = clamp(action.timeSec, 0, max);
            if (max > 0 && next >= max) {
                return { ...state, currentTimeSec: max, isPlaying: false };
            }
            return { ...state, currentTimeSec: next };
        }
        case 'SAVE_START':
            return { ...state, saving: true, error: null };
        case 'SAVE_SUCCESS':
            return { ...state, saving: false, dirty: false, timeline: action.timeline };
        case 'SAVE_FAIL':
            return { ...state, saving: false, error: action.error };
        case 'ERROR':
            return { ...state, error: action.error };
        default:
            return state;
    }
}

// ── Selectors (pure) ─────────────────────────────────────────────────────

export function getSelectedClip(state: TimelineEditorState): TimelineClip | null {
    if (!state.timeline || !state.selectedClipId) return null;
    return state.timeline.clips.find(c => c.id === state.selectedClipId) ?? null;
}

export function getCurrentClip(state: TimelineEditorState): TimelineClip | null {
    if (!state.timeline) return null;
    return state.timeline.clips.find(
        c => state.currentTimeSec >= c.start && state.currentTimeSec < c.start + c.duration,
    ) ?? null;
}

export function formatTime(sec: number): string {
    const total = Math.max(0, Math.floor(sec));
    const m = Math.floor(total / 60);
    const s = total % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}
