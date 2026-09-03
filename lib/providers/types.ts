export type VideoProviderId = 'wan' | 'kling' | 'veo' | string;

export interface VideoProviderCapabilities {
    audioNative: boolean;
    maxDurationSec: number;
    aspectRatios: string[];
    resolutions: string[];
    imageToVideo: boolean;
    textToVideo: boolean;
    multiShot: boolean;
}

export interface VideoGenInput {
    prompt: string;
    negativePrompt?: string;
    imageUrl?: string;
    aspectRatio: '9:16' | '1:1' | '16:9' | '4:5';
    durationSec: number;
    resolution?: string;
    seed?: number;
    extra?: Record<string, unknown>;
}

export interface VideoGenHandle {
    externalJobId: string;
    providerId: VideoProviderId;
    estimatedCostUsd?: number;
    startedAt: string;
}

export type VideoJobState = 'queued' | 'processing' | 'completed' | 'failed' | 'cancelled';

export interface VideoJobStatus {
    externalJobId: string;
    state: VideoJobState;
    outputUrl?: string;
    error?: string;
    raw?: unknown;
}

export interface VideoProvider {
    readonly id: VideoProviderId;
    readonly enabled: boolean;
    readonly capabilities: VideoProviderCapabilities;
    generate(input: VideoGenInput): Promise<VideoGenHandle>;
    pollStatus(externalJobId: string): Promise<VideoJobStatus>;
    cancel(externalJobId: string): Promise<void>;
}

export interface ImageGenInput {
    prompt: string;
    negativePrompt?: string;
    width: number;
    height: number;
    referenceImageUrl?: string;
    seed?: number;
    extra?: Record<string, unknown>;
}

export interface ImageGenOutput {
    imageUrl: string;
    seed?: number;
}

export interface ImageProvider {
    readonly id: string;
    readonly enabled: boolean;
    generateImage(input: ImageGenInput): Promise<ImageGenOutput>;
}

export interface VoiceGenInput {
    text: string;
    language: string;
    voiceId?: string;
    speed?: number;
    pitch?: number;
    extra?: Record<string, unknown>;
}

export interface VoiceGenOutput {
    audioUrl: string;
    durationSec: number;
}

export interface VoiceProvider {
    readonly id: string;
    readonly enabled: boolean;
    readonly supportedLanguages: string[];
    synthesize(input: VoiceGenInput): Promise<VoiceGenOutput>;
}

export interface MusicGenInput {
    prompt: string;
    durationSec: number;
    mood?: string;
    extra?: Record<string, unknown>;
}

export interface MusicGenOutput {
    audioUrl: string;
    durationSec: number;
}

export interface MusicProvider {
    readonly id: string;
    readonly enabled: boolean;
    generate(input: MusicGenInput): Promise<MusicGenOutput>;
}

export interface UploadInput {
    data: Buffer | string;
    mimeType: string;
    filename: string;
    userId: string;
    projectId?: string;
}

export interface UploadOutput {
    url: string;
    thumbnailUrl?: string;
}

export interface StorageProvider {
    readonly id: string;
    upload(input: UploadInput): Promise<UploadOutput>;
    delete(url: string): Promise<void>;
}

export type SocialPlatform = 'tiktok' | 'instagram' | 'facebook' | 'youtube' | 'linkedin';

export interface SocialPublishInput {
    platform: SocialPlatform;
    videoUrl: string;
    caption: string;
    hashtags?: string[];
    scheduledAt?: string;
    externalAccountId: string;
}

export interface SocialPublishOutput {
    publishId: string;
    url?: string;
    state: 'scheduled' | 'published' | 'failed';
}

export interface SocialProvider {
    readonly id: SocialPlatform;
    readonly enabled: boolean;
    publish(input: SocialPublishInput): Promise<SocialPublishOutput>;
}

export interface VideoProviderChainEntry {
    providerId: VideoProviderId;
    retries: number;
}

export interface VideoProviderChainConfig {
    chain: VideoProviderChainEntry[];
}
