import { VideoProvider as VideoProviderContract } from '../types';

/**
 * GOOGLE VEO 3.1 — STUB adapter.
 *
 * Status: `enabled: false`. This file does NOT call any Google API.
 * It exists to lock in the `VideoProvider` contract for future activation
 * and to make capability declarations explicit and verifiable.
 *
 * Capabilities below are documented as "pending verification" where the
 * public Google API surface for Veo 3.1 was not fully confirmed at the
 * time of writing. Do NOT enable this provider until:
 *   1. Endpoint, auth model, and request shape are verified against
 *      official Google docs (ai.google.dev / cloud.google.com/vertex-ai).
 *   2. The corresponding API key / service account is provisioned.
 *   3. Real capabilities are filled in (replace `unknown` with verified
 *      values from official documentation).
 *
 * When activation is approved, the implementation must use submit-and-poll
 * natively — Veo returns a long-running operation handle. The internal
 * job map pattern from wan.ts/kling.ts is NOT required.
 */

import {
    VideoGenInput,
    VideoGenHandle,
    VideoJobStatus,
    VideoProviderCapabilities,
} from '../types';

const NOT_ENABLED_ERROR =
    'veo provider is not enabled in this build. Activate only after verifying the official Google Veo 3.1 API surface and provisioning credentials.';

function capabilities(): VideoProviderCapabilities {
    return {
        // Native audio (voice/music/sfx in one pass) — public docs report
        // Veo supports audio generation; awaiting confirmation of the API
        // surface for the channel Adsíntesis will use.
        audioNative: true,
        maxDurationSec: 8,
        aspectRatios: ['16:9', '9:16'],
        resolutions: ['720p', '1080p'],
        imageToVideo: true,
        textToVideo: true,
        multiShot: false,
    };
}

export const veoProvider: VideoProviderContract = {
    id: 'veo',
    enabled: false,
    capabilities: capabilities(),

    async generate(_input: VideoGenInput): Promise<VideoGenHandle> {
        throw new Error(NOT_ENABLED_ERROR);
    },

    async pollStatus(_externalJobId: string): Promise<VideoJobStatus> {
        throw new Error(NOT_ENABLED_ERROR);
    },

    async cancel(_externalJobId: string): Promise<void> {
        throw new Error(NOT_ENABLED_ERROR);
    },
};
