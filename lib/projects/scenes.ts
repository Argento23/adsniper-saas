import { Scene, SceneStatus, SceneTimestamps, TransitionType, AspectRatio, SceneMetadata } from './types';
import { newProjectId } from './id';

const STORAGE_KEY = 'AdSíntesisStudio.scenes';

export interface CreateSceneInput {
    projectId: string;
    order: number;
    title?: string;
    description?: string;
    prompt?: string;
    visualPrompt: string;
    negativePrompt?: string;
    camera?: string;
    voiceover?: string;
    onScreenText?: string;
    durationSec: number;
    aspectRatio?: AspectRatio;
    transitionIn?: TransitionType;
    metadata?: SceneMetadata;
}

export interface UpdateScenePatch {
    order?: number;
    title?: string;
    description?: string;
    prompt?: string;
    visualPrompt?: string;
    negativePrompt?: string;
    camera?: string;
    voiceover?: string;
    onScreenText?: string;
    durationSec?: number;
    aspectRatio?: AspectRatio;
    keyframeAssetId?: string;
    videoAssetId?: string;
    voiceAssetId?: string;
    transitionIn?: TransitionType;
    videoProviderId?: 'wan' | 'kling' | 'veo';
    metadata?: SceneMetadata;
    status?: SceneStatus;
    timestamps?: Partial<SceneTimestamps>;
}

export interface SceneStore {
    listScenes(projectId: string): Scene[];
    getScene(projectId: string, sceneId: string): Scene | null;
    createScene(input: CreateSceneInput): Scene;
    updateScene(projectId: string, sceneId: string, patch: UpdateScenePatch): Scene | null;
    deleteScene(projectId: string, sceneId: string): boolean;
    reorderScenes(projectId: string, orderedSceneIds: string[]): boolean;
}

function emptyTimestamps(now: string): SceneTimestamps {
    return {
        createdAt: now,
        updatedAt: now,
    };
}

function readRaw(): Record<string, Scene[]> {
    if (typeof window === 'undefined') return {};
    try {
        const raw = window.localStorage.getItem(STORAGE_KEY);
        if (!raw) return {};
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object') return parsed as Record<string, Scene[]>;
        return {};
    } catch {
        return {};
    }
}

function writeRaw(map: Record<string, Scene[]>): void {
    if (typeof window === 'undefined') return;
    try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
    } catch {
        /* quota exceeded: ignored for MVP */
    }
}

export const localStorageSceneStore: SceneStore = {
    listScenes(projectId: string): Scene[] {
        const map = readRaw();
        const list = map[projectId] ?? [];
        return [...list].sort((a, b) => a.order - b.order);
    },

    getScene(projectId: string, sceneId: string): Scene | null {
        const map = readRaw();
        const list = map[projectId] ?? [];
        return list.find(s => s.id === sceneId) ?? null;
    },

    createScene(input: CreateSceneInput): Scene {
        const now = new Date().toISOString();
        const scene: Scene = {
            id: newProjectId(),
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

    updateScene(projectId: string, sceneId: string, patch: UpdateScenePatch): Scene | null {
        const map = readRaw();
        const list = map[projectId] ?? [];
        const idx = list.findIndex(s => s.id === sceneId);
        if (idx === -1) return null;
        const now = new Date().toISOString();
        const next: Scene = {
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

    deleteScene(projectId: string, sceneId: string): boolean {
        const map = readRaw();
        const list = map[projectId] ?? [];
        const next = list.filter(s => s.id !== sceneId);
        if (next.length === list.length) return false;
        map[projectId] = next;
        writeRaw(map);
        return true;
    },

    reorderScenes(projectId: string, orderedSceneIds: string[]): boolean {
        const map = readRaw();
        const list = map[projectId] ?? [];
        const byId = new Map(list.map(s => [s.id, s]));
        if (orderedSceneIds.some(id => !byId.has(id))) return false;
        if (orderedSceneIds.length !== list.length) return false;
        const now = new Date().toISOString();
        const reordered = orderedSceneIds.map((id, idx) => {
            const s = byId.get(id)!;
            return { ...s, order: idx, timestamps: { ...s.timestamps, updatedAt: now } };
        });
        map[projectId] = reordered;
        writeRaw(map);
        return true;
    },
};

export function getSceneStore(): SceneStore {
    return localStorageSceneStore;
}
