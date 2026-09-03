import { VideoProvider, VideoProviderId } from '../types';
import { wanProvider } from './wan';
import { klingProvider } from './kling';
import { veoProvider } from './veo';

const registry: Record<string, VideoProvider> = {
    wan: wanProvider,
    kling: klingProvider,
    veo: veoProvider,
};

export function getVideoProvider(id: VideoProviderId): VideoProvider | undefined {
    return registry[id];
}

export function listVideoProviders(): VideoProvider[] {
    return Object.values(registry);
}

export function listEnabledVideoProviders(): VideoProvider[] {
    return listVideoProviders().filter(p => p.enabled);
}

export function registerVideoProvider(provider: VideoProvider): void {
    registry[provider.id] = provider;
}

export { wanProvider, klingProvider, veoProvider };
