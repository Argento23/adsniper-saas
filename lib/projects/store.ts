import {
    Project,
    Brief,
    AspectRatio,
    BrandSnapshot,
    TimelineState,
    ProjectStatus,
} from './types';
import { newProjectId } from './id';

const STORAGE_KEY = 'AdSíntesisStudio.projects';

export interface CreateProjectInput {
    userId: string;
    name: string;
    brief: Brief;
    format: AspectRatio;
    duration: number;
    brandSnapshot?: BrandSnapshot;
}

export interface UpdateProjectPatch {
    name?: string;
    brandSnapshot?: BrandSnapshot;
    brief?: Brief;
    format?: AspectRatio;
    duration?: number;
    status?: ProjectStatus;
    timeline?: TimelineState;
}

export interface ProjectStore {
    listProjects(userId: string): Project[];
    getProject(userId: string, id: string): Project | null;
    createProject(input: CreateProjectInput): Project;
    updateProject(userId: string, id: string, patch: UpdateProjectPatch): Project | null;
    deleteProject(userId: string, id: string): boolean;
}

function emptyTimeline(): TimelineState {
    return {
        totalDurationSec: 0,
        videoTrack: [],
        voiceTrack: [],
        musicTrack: [],
        textTrack: [],
    };
}

function readRaw(): Record<string, Project[]> {
    if (typeof window === 'undefined') return {};
    try {
        const raw = window.localStorage.getItem(STORAGE_KEY);
        if (!raw) return {};
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object') return parsed as Record<string, Project[]>;
        return {};
    } catch {
        return {};
    }
}

function writeRaw(map: Record<string, Project[]>): void {
    if (typeof window === 'undefined') return;
    try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
    } catch {
        /* quota exceeded: ignored for MVP */
    }
}

export const localStorageProjectStore: ProjectStore = {
    listProjects(userId: string): Project[] {
        const map = readRaw();
        const list = map[userId] ?? [];
        return [...list].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    },

    getProject(userId: string, id: string): Project | null {
        const map = readRaw();
        const list = map[userId] ?? [];
        return list.find(p => p.id === id) ?? null;
    },

    createProject(input: CreateProjectInput): Project {
        const now = new Date().toISOString();
        const project: Project = {
            id: newProjectId(),
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

    updateProject(userId: string, id: string, patch: UpdateProjectPatch): Project | null {
        const map = readRaw();
        const list = map[userId] ?? [];
        const idx = list.findIndex(p => p.id === id);
        if (idx === -1) return null;
        const now = new Date().toISOString();
        const updated: Project = {
            ...list[idx],
            ...patch,
            updatedAt: now,
        };
        list[idx] = updated;
        map[userId] = list;
        writeRaw(map);
        return updated;
    },

    deleteProject(userId: string, id: string): boolean {
        const map = readRaw();
        const list = map[userId] ?? [];
        const next = list.filter(p => p.id !== id);
        if (next.length === list.length) return false;
        map[userId] = next;
        writeRaw(map);
        return true;
    },
};

export function getProjectStore(): ProjectStore {
    return localStorageProjectStore;
}
