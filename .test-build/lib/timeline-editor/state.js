"use strict";
/**
 * Pure state reducer for the TimelineEditor.
 *
 * Extracted from the React component so the editor's logic is testable
 * without a DOM. All actions return a new state object; the reducer
 * never mutates.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.initialState = void 0;
exports.reducer = reducer;
exports.getSelectedClip = getSelectedClip;
exports.getCurrentClip = getCurrentClip;
exports.formatTime = formatTime;
const timeline_1 = require("@/lib/projects/timeline");
exports.initialState = {
    timeline: null,
    selectedClipId: null,
    isPlaying: false,
    currentTimeSec: 0,
    dirty: false,
    saving: false,
    error: null,
    loading: true,
};
function clamp(n, min, max) {
    return Math.max(min, Math.min(max, n));
}
function withClipsRecomputed(timeline, clips) {
    // Rebuild sequential starts preserving the explicit order of `clips`
    // (does NOT sort — caller has already chosen the order, e.g. via
    // drag-to-reorder).
    let acc = 0;
    const next = clips.map((clip) => {
        const updated = { ...clip, start: acc };
        acc += clip.duration;
        return updated;
    });
    return {
        ...timeline,
        clips: next,
        duration: (0, timeline_1.computeTotalDuration)(next),
    };
}
function reducer(state, action) {
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
            if (!state.timeline)
                return state;
            const clips = [...state.timeline.clips];
            if (action.fromIndex < 0 || action.fromIndex >= clips.length)
                return state;
            if (action.toIndex < 0 || action.toIndex >= clips.length)
                return state;
            const [moved] = clips.splice(action.fromIndex, 1);
            clips.splice(action.toIndex, 0, moved);
            return {
                ...state,
                timeline: withClipsRecomputed(state.timeline, clips),
                dirty: true,
            };
        }
        case 'UPDATE_CLIP': {
            if (!state.timeline)
                return state;
            const idx = state.timeline.clips.findIndex(c => c.id === action.clipId);
            if (idx === -1)
                return state;
            const merged = {
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
            if (!state.timeline)
                return state;
            const clips = state.timeline.clips.filter(c => c.id !== action.clipId);
            if (clips.length === state.timeline.clips.length)
                return state;
            const next = withClipsRecomputed(state.timeline, clips);
            return {
                ...state,
                timeline: next,
                selectedClipId: state.selectedClipId === action.clipId ? null : state.selectedClipId,
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
function getSelectedClip(state) {
    if (!state.timeline || !state.selectedClipId)
        return null;
    return state.timeline.clips.find(c => c.id === state.selectedClipId) ?? null;
}
function getCurrentClip(state) {
    if (!state.timeline)
        return null;
    return state.timeline.clips.find(c => state.currentTimeSec >= c.start && state.currentTimeSec < c.start + c.duration) ?? null;
}
function formatTime(sec) {
    const total = Math.max(0, Math.floor(sec));
    const m = Math.floor(total / 60);
    const s = total % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}
