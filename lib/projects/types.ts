export type ProjectStatus = 'draft' | 'generating' | 'ready' | 'exported';

export type Platform = 'tiktok' | 'reels' | 'shorts' | 'feed' | 'facebook' | 'youtube';

export type AspectRatio = '9:16' | '1:1' | '16:9' | '4:5';

export interface Brief {
    product: string;
    objective: 'awareness' | 'conversion' | 'engagement' | 'launch';
    audience: string;
    platform: Platform;
    style: string;
    language: string;
    referenceImages: string[];
    logoUrl?: string;
    productPhotos: string[];
}

export interface BrandSnapshot {
    name: string;
    logoUrl?: string;
    primaryColor?: string;
    tone?: string;
    website?: string;
}

export interface TimelineState {
    totalDurationSec: number;
    videoTrack: { sceneId: string; startSec: number; durationSec: number }[];
    voiceTrack: { assetId: string; startSec: number; durationSec: number }[];
    musicTrack: { assetId: string; startSec: number; durationSec: number }[];
    textTrack: { text: string; startSec: number; durationSec: number; position?: string }[];
}

export interface Project {
    id: string;
    userId: string;
    name: string;
    brandSnapshot?: BrandSnapshot;
    brief: Brief;
    format: AspectRatio;
    duration: number;
    status: ProjectStatus;
    timeline: TimelineState;
    createdAt: string;
    updatedAt: string;

    // Extended fields for Studio MVP
    scenes?: Scene[];
    lastExport?: {
        date: string;
        resolution: string;
        fps: number;
        status: 'completed' | 'failed';
    };
    published?: boolean;
    publishedAt?: string;
    platform?: string;
    description?: string;
}

export type SceneStatus =
    | 'pending'
    | 'prompt_ready'
    | 'generating_keyframe'
    | 'keyframe_ready'
    | 'generating_video'
    | 'video_ready'
    | 'ready'
    | 'failed';

export type TransitionType = 'cut' | 'fade' | 'dissolve';

export interface SceneTimestamps {
    createdAt: string;
    updatedAt: string;
    keyframeRequestedAt?: string;
    keyframeReadyAt?: string;
    videoRequestedAt?: string;
    videoReadyAt?: string;
}

export interface SceneMetadata {
    [key: string]: unknown;
}

export interface Scene {
    id: string;
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
    keyframeAssetId?: string;
    videoAssetId?: string;
    voiceAssetId?: string;
    transitionIn?: TransitionType;
    videoProviderId?: 'wan' | 'kling' | 'veo';
    metadata?: SceneMetadata;
    timestamps: SceneTimestamps;
    status: SceneStatus;
}

export interface VisualContext {
    brandSnapshot?: BrandSnapshot;
    characterReferences: string[];
    productReferences: string[];
    locationReferences: string[];
    visualStyle?: string;
    colorGuidance?: string;
    globalNegativePrompt?: string;
}

export type AssetType =
    | 'image'
    | 'video'
    | 'audio'
    | 'logo'
    | 'voice'
    | 'music'
    | 'subtitle';

export interface Asset {
    id: string;
    userId: string;
    projectId?: string;
    type: AssetType;
    url: string;
    thumbnailUrl?: string;
    filename: string;
    mimeType: string;
    width?: number;
    height?: number;
    durationSec?: number;
    provider?: string;
    model?: string;
    prompt?: string;
    metadata?: Record<string, unknown>;
    createdAt: string;
}
