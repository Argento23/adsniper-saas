"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.veoProvider = exports.klingProvider = exports.wanProvider = void 0;
exports.getVideoProvider = getVideoProvider;
exports.listVideoProviders = listVideoProviders;
exports.listEnabledVideoProviders = listEnabledVideoProviders;
exports.registerVideoProvider = registerVideoProvider;
const wan_1 = require("./wan");
Object.defineProperty(exports, "wanProvider", { enumerable: true, get: function () { return wan_1.wanProvider; } });
const kling_1 = require("./kling");
Object.defineProperty(exports, "klingProvider", { enumerable: true, get: function () { return kling_1.klingProvider; } });
const veo_1 = require("./veo");
Object.defineProperty(exports, "veoProvider", { enumerable: true, get: function () { return veo_1.veoProvider; } });
const registry = {
    wan: wan_1.wanProvider,
    kling: kling_1.klingProvider,
    veo: veo_1.veoProvider,
};
function getVideoProvider(id) {
    return registry[id];
}
function listVideoProviders() {
    return Object.values(registry);
}
function listEnabledVideoProviders() {
    return listVideoProviders().filter(p => p.enabled);
}
function registerVideoProvider(provider) {
    registry[provider.id] = provider;
}
