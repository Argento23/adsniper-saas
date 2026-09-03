export function newProjectId(): string {
    const g = globalThis as unknown as { crypto?: { randomUUID?: () => string } };
    if (g.crypto && typeof g.crypto.randomUUID === 'function') {
        return `prj_${g.crypto.randomUUID()}`;
    }
    return `prj_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}
