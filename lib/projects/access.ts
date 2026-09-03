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

import { getProjectStore } from './store';
import { getSceneStore } from './scenes';
import { Project, Scene } from './types';

export type AccessResult<T> =
    | { ok: true; value: T }
    | { ok: false; status: 401 | 403 | 404; error: string };

export function requireProject(userId: string, projectId: string): AccessResult<Project> {
    if (!userId) return { ok: false, status: 401, error: 'unauthorized' };
    const project = getProjectStore().getProject(userId, projectId);
    if (!project) return { ok: false, status: 404, error: 'project not found' };
    return { ok: true, value: project };
}

export function requireScene(
    userId: string,
    projectId: string,
    sceneId: string,
): AccessResult<{ project: Project; scene: Scene }> {
    const p = requireProject(userId, projectId);
    if (!p.ok) return p;
    const scene = getSceneStore().getScene(projectId, sceneId);
    if (!scene) return { ok: false, status: 404, error: 'scene not found' };
    return { ok: true, value: { project: p.value, scene } };
}
