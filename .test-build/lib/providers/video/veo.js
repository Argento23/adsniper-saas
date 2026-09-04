"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.veoProvider = void 0;
const NOT_ENABLED_ERROR = 'veo provider is not enabled in this build. Activate only after verifying the official Google Veo 3.1 API surface and provisioning credentials.';
function capabilities() {
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
exports.veoProvider = {
    id: 'veo',
    enabled: false,
    capabilities: capabilities(),
    async generate(_input) {
        throw new Error(NOT_ENABLED_ERROR);
    },
    async pollStatus(_externalJobId) {
        throw new Error(NOT_ENABLED_ERROR);
    },
    async cancel(_externalJobId) {
        throw new Error(NOT_ENABLED_ERROR);
    },
};
