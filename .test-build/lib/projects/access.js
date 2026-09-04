"use strict";
/**
 * Project authorization helper.
 *
 * Enforces the rule:
 *   userId → project (owned by userId) → scene (inside that project)
 *
 * All Scene APIs in /api/studio/projects/[projectId]/... MUST call
 * `requireProjectAccess(userId, projectId)` before any read/write.
 * This guarantees that user A cannot read, mutate, or delete scenes
 * belonging to user B's project.
 *
 * IMPORTANT: this module is browser-safe (the underlying project store
 * reads from localStorage). Server-side endpoints forward the resolved
 * userId from Clerk, so isolation is enforced server-side.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.requireProject = requireProject;
exports.requireScene = requireScene;
const store_1 = require("./store");
const scenes_1 = require("./scenes");
function requireProject(userId, projectId) {
    if (!userId)
        return { ok: false, status: 401, error: 'unauthorized' };
    const project = (0, store_1.getProjectStore)().getProject(userId, projectId);
    if (!project)
        return { ok: false, status: 404, error: 'project not found' };
    return { ok: true, value: project };
}
function requireScene(userId, projectId, sceneId) {
    const p = requireProject(userId, projectId);
    if (!p.ok)
        return p;
    const scene = (0, scenes_1.getSceneStore)().getScene(projectId, sceneId);
    if (!scene)
        return { ok: false, status: 404, error: 'scene not found' };
    return { ok: true, value: { project: p.value, scene } };
}
