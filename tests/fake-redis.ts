/**
 * Fake in-memory Redis for tests.
 *
 * Implements the `RedisLike` subset declared in
 * `lib/jobs/redis.ts`. Sufficient for unit-testing RedisJobQueue
 * without hitting Upstash. Stores raw values in plain JS Maps/Sets/
 * Arrays to mimic Redis data types.
 */

import { RedisLike } from '../lib/jobs/redis';

export class FakeRedis implements RedisLike {
    public hashes = new Map<string, Record<string, string>>();
    public lists = new Map<string, string[]>();
    public sets = new Map<string, Set<string>>();
    public zsets = new Map<string, Map<string, number>>();

    /** Toggles Redis-error simulation for testing error paths. */
    public failNext = new Map<string, string>();

    private maybeFail(op: string): void {
        const err = this.failNext.get(op);
        if (err) {
            this.failNext.delete(op);
            throw new Error(err);
        }
    }

    async hset(key: string, values: Record<string, string | number>): Promise<unknown> {
        this.maybeFail('hset');
        const h = this.hashes.get(key) ?? {};
        for (const [k, v] of Object.entries(values)) h[k] = String(v);
        this.hashes.set(key, h);
        return 'OK';
    }

    async hgetall(key: string): Promise<Record<string, string> | null> {
        this.maybeFail('hgetall');
        return this.hashes.get(key) ?? null;
    }

    async hdel(key: string, field: string | string[]): Promise<unknown> {
        const h = this.hashes.get(key);
        if (!h) return 0;
        const fields = Array.isArray(field) ? field : [field];
        let n = 0;
        for (const f of fields) if (f in h) { delete h[f]; n++; }
        return n;
    }

    async lpush(key: string, ...values: string[]): Promise<unknown> {
        this.maybeFail('lpush');
        const list = this.lists.get(key) ?? [];
        for (const v of values) list.unshift(v);
        this.lists.set(key, list);
        return list.length;
    }

    async rpop(key: string): Promise<string | null> {
        this.maybeFail('rpop');
        const list = this.lists.get(key);
        if (!list || list.length === 0) return null;
        return list.pop() ?? null;
    }

    async llen(key: string): Promise<number> {
        return (this.lists.get(key) ?? []).length;
    }

    async lrange(key: string, start: number, stop: number): Promise<string[]> {
        const list = this.lists.get(key) ?? [];
        const end = stop < 0 ? list.length + stop + 1 : stop + 1;
        return list.slice(start, end);
    }

    async sadd(key: string, ...members: string[]): Promise<unknown> {
        const set = this.sets.get(key) ?? new Set<string>();
        for (const m of members) set.add(m);
        this.sets.set(key, set);
        return set.size;
    }

    async srem(key: string, ...members: string[]): Promise<unknown> {
        const set = this.sets.get(key);
        if (!set) return 0;
        let n = 0;
        for (const m of members) if (set.delete(m)) n++;
        return n;
    }

    async smembers(key: string): Promise<string[]> {
        return Array.from(this.sets.get(key) ?? new Set<string>());
    }

    async zadd(key: string, members: Record<string, number>): Promise<unknown> {
        const z = this.zsets.get(key) ?? new Map<string, number>();
        for (const [m, s] of Object.entries(members)) z.set(m, s);
        this.zsets.set(key, z);
        return Object.keys(members).length;
    }

    async zrem(key: string, ...members: string[]): Promise<unknown> {
        const z = this.zsets.get(key);
        if (!z) return 0;
        let n = 0;
        for (const m of members) if (z.delete(m)) n++;
        return n;
    }

    async zrangebyscore(key: string, min: number | string, max: number | string): Promise<string[]> {
        const z = this.zsets.get(key);
        if (!z) return [];
        const minN = min === '-inf' ? -Infinity : Number(min);
        const maxN = max === '+inf' ? Infinity : Number(max);
        return Array.from(z.entries())
            .filter(([, s]) => s >= minN && s <= maxN)
            .sort((a, b) => a[1] - b[1])
            .map(([m]) => m);
    }

    async zremrangebyscore(key: string, min: number | string, max: number | string): Promise<unknown> {
        const z = this.zsets.get(key);
        if (!z) return 0;
        const minN = min === '-inf' ? -Infinity : Number(min);
        const maxN = max === '+inf' ? Infinity : Number(max);
        let n = 0;
        for (const [m, s] of [...z.entries()]) {
            if (s >= minN && s <= maxN) {
                z.delete(m);
                n++;
            }
        }
        return n;
    }

    async zcard(key: string): Promise<number> {
        return (this.zsets.get(key) ?? new Map()).size;
    }

    async del(...keys: string[]): Promise<unknown> {
        let n = 0;
        for (const k of keys) {
            let had = false;
            if (this.hashes.delete(k)) had = true;
            if (this.lists.delete(k)) had = true;
            if (this.sets.delete(k)) had = true;
            if (this.zsets.delete(k)) had = true;
            if (had) n++;
        }
        return n;
    }

    async exists(...keys: string[]): Promise<number> {
        let n = 0;
        for (const k of keys) {
            if (this.hashes.has(k) || this.lists.has(k) || this.sets.has(k) || this.zsets.has(k)) n++;
        }
        return n;
    }

    // ── Test helpers ────────────────────────────────────────────────────

    _wipe(): void {
        this.hashes.clear();
        this.lists.clear();
        this.sets.clear();
        this.zsets.clear();
    }
}
