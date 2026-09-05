import {
    Project,
    Brief,
    AspectRatio,
    BrandSnapshot,
    TimelineState,
    ProjectStatus,
    Scene,
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
    scenes?: Scene[];
    lastExport?: Project['lastExport'];
    published?: boolean;
    publishedAt?: string;
    platform?: string;
    description?: string;
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

function migrateProject(project: any): Project {
    // Migration for older projects that don't have the new fields
    return {
        ...project,
        scenes: project.scenes ?? [],
        lastExport: project.lastExport ?? undefined,
        published: project.published ?? false,
        publishedAt: project.publishedAt ?? undefined,
        platform: project.platform ?? undefined,
        description: project.description ?? undefined,
    };
}

function readRaw(): Record<string, Project[]> {
    if (typeof window === 'undefined') return {};
    try {
        const raw = window.localStorage.getItem(STORAGE_KEY);
        if (!raw) return {};
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object') {
            // Apply migration to all projects
            const migrated: Record<string, Project[]> = {};
            for (const [userId, projects] of Object.entries(parsed)) {
                migrated[userId] = (projects as any[]).map(migrateProject);
            }
            return migrated;
        }
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
            scenes: [],
            lastExport: undefined,
            published: false,
            publishedAt: undefined,
            platform: undefined,
            description: undefined,
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
