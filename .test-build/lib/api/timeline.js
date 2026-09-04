"use strict";
/**
 * Timeline API client.
 *
 * Thin fetch wrapper for `/api/studio/projects/[projectId]/timeline/*`.
 * Mirrors the inline-fetch pattern used by other Studio components but
 * centralises the URLs and error mapping so the editor stays clean.
 *
 * All calls return a typed result or throw with a normalised Error.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.fetchTimeline = fetchTimeline;
exports.createTimeline = createTimeline;
exports.patchTimeline = patchTimeline;
exports.deleteClip = deleteClip;
exports.patchClip = patchClip;
async function call(input, init) {
    const res = await fetch(input, init);
    const data = (await res.json().catch(() => ({})));
    if (!res.ok) {
        const message = typeof data.error === 'string' ? data.error : `HTTP ${res.status}`;
        const err = new Error(message);
        err.status = res.status;
        throw err;
    }
    return data;
}
async function fetchTimeline(projectId) {
    const data = await call(`/api/studio/projects/${projectId}/timeline`);
    return data.timeline;
}
async function createTimeline(projectId, timeline) {
    const data = await call(`/api/studio/projects/${projectId}/timeline`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(timeline),
    });
    return data.timeline;
}
async function patchTimeline(projectId, clips) {
    const data = await call(`/api/studio/projects/${projectId}/timeline`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clips }),
    });
    return data.timeline;
}
async function deleteClip(projectId, clipId) {
    const data = await call(`/api/studio/projects/${projectId}/timeline/clips/${clipId}`, { method: 'DELETE' });
    return data.timeline;
}
async function patchClip(projectId, clipId, patch) {
    const data = await call(`/api/studio/projects/${projectId}/timeline/clips/${clipId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
    });
    return data.timeline;
}
