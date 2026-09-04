"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.localStorageSceneStore = void 0;
exports.getSceneStore = getSceneStore;
const id_1 = require("./id");
const STORAGE_KEY = 'AdSíntesisStudio.scenes';
function emptyTimestamps(now) {
    return {
        createdAt: now,
        updatedAt: now,
    };
}
function readRaw() {
    if (typeof window === 'undefined')
        return {};
    try {
        const raw = window.localStorage.getItem(STORAGE_KEY);
        if (!raw)
            return {};
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object')
            return parsed;
        return {};
    }
    catch {
        return {};
    }
}
function writeRaw(map) {
    if (typeof window === 'undefined')
        return;
    try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
    }
    catch {
        /* quota exceeded: ignored for MVP */
    }
}
exports.localStorageSceneStore = {
    listScenes(projectId) {
        const map = readRaw();
        const list = map[projectId] ?? [];
        return [...list].sort((a, b) => a.order - b.order);
    },
    getScene(projectId, sceneId) {
        const map = readRaw();
        const list = map[projectId] ?? [];
        return list.find(s => s.id === sceneId) ?? null;
    },
    createScene(input) {
        const now = new Date().toISOString();
        const scene = {
            id: (0, id_1.newProjectId)(),
            projectId: input.projectId,
            order: input.order,
            title: input.title,
            description: input.description,
            prompt: input.prompt,
            visualPrompt: input.visualPrompt,
            negativePrompt: input.negativePrompt,
            camera: input.camera,
            voiceover: input.voiceover,
            onScreenText: input.onScreenText,
            durationSec: input.durationSec,
            aspectRatio: input.aspectRatio,
            transitionIn: input.transitionIn,
            metadata: input.metadata,
            timestamps: emptyTimestamps(now),
            status: 'pending',
        };
        const map = readRaw();
        const list = map[input.projectId] ?? [];
        list.push(scene);
        map[input.projectId] = list;
        writeRaw(map);
        return scene;
    },
    updateScene(projectId, sceneId, patch) {
        const map = readRaw();
        const list = map[projectId] ?? [];
        const idx = list.findIndex(s => s.id === sceneId);
        if (idx === -1)
            return null;
        const now = new Date().toISOString();
        const next = {
            ...list[idx],
            ...patch,
            timestamps: {
                ...list[idx].timestamps,
                ...(patch.timestamps ?? {}),
                updatedAt: now,
            },
        };
        list[idx] = next;
        map[projectId] = list;
        writeRaw(map);
        return next;
    },
    deleteScene(projectId, sceneId) {
        const map = readRaw();
        const list = map[projectId] ?? [];
        const next = list.filter(s => s.id !== sceneId);
        if (next.length === list.length)
            return false;
        map[projectId] = next;
        writeRaw(map);
        return true;
    },
    reorderScenes(projectId, orderedSceneIds) {
        const map = readRaw();
        const list = map[projectId] ?? [];
        const byId = new Map(list.map(s => [s.id, s]));
        if (orderedSceneIds.some(id => !byId.has(id)))
            return false;
        if (orderedSceneIds.length !== list.length)
            return false;
        const now = new Date().toISOString();
        const reordered = orderedSceneIds.map((id, idx) => {
            const s = byId.get(id);
            return { ...s, order: idx, timestamps: { ...s.timestamps, updatedAt: now } };
        });
        map[projectId] = reordered;
        writeRaw(map);
        return true;
    },
};
function getSceneStore() {
    return exports.localStorageSceneStore;
}
