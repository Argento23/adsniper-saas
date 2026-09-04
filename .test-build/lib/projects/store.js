"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.localStorageProjectStore = void 0;
exports.getProjectStore = getProjectStore;
const id_1 = require("./id");
const STORAGE_KEY = 'AdSíntesisStudio.projects';
function emptyTimeline() {
    return {
        totalDurationSec: 0,
        videoTrack: [],
        voiceTrack: [],
        musicTrack: [],
        textTrack: [],
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
exports.localStorageProjectStore = {
    listProjects(userId) {
        const map = readRaw();
        const list = map[userId] ?? [];
        return [...list].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    },
    getProject(userId, id) {
        const map = readRaw();
        const list = map[userId] ?? [];
        return list.find(p => p.id === id) ?? null;
    },
    createProject(input) {
        const now = new Date().toISOString();
        const project = {
            id: (0, id_1.newProjectId)(),
            userId: input.userId,
            name: input.name,
            brandSnapshot: input.brandSnapshot,
            brief: input.brief,
            format: input.format,
            duration: input.duration,
            status: 'draft',
            timeline: emptyTimeline(),
            createdAt: now,
            updatedAt: now,
        };
        const map = readRaw();
        const list = map[input.userId] ?? [];
        list.push(project);
        map[input.userId] = list;
        writeRaw(map);
        return project;
    },
    updateProject(userId, id, patch) {
        const map = readRaw();
        const list = map[userId] ?? [];
        const idx = list.findIndex(p => p.id === id);
        if (idx === -1)
            return null;
        const now = new Date().toISOString();
        const updated = {
            ...list[idx],
            ...patch,
            updatedAt: now,
        };
        list[idx] = updated;
        map[userId] = list;
        writeRaw(map);
        return updated;
    },
    deleteProject(userId, id) {
        const map = readRaw();
        const list = map[userId] ?? [];
        const next = list.filter(p => p.id !== id);
        if (next.length === list.length)
            return false;
        map[userId] = next;
        writeRaw(map);
        return true;
    },
};
function getProjectStore() {
    return exports.localStorageProjectStore;
}
