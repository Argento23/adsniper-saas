"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.newProjectId = newProjectId;
function newProjectId() {
    const g = globalThis;
    if (g.crypto && typeof g.crypto.randomUUID === 'function') {
        return `prj_${g.crypto.randomUUID()}`;
    }
    return `prj_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}
