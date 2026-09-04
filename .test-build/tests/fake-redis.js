"use strict";
/**
 * Fake in-memory Redis for tests.
 *
 * Implements the `RedisLike` subset declared in
 * `lib/jobs/redis.ts`. Sufficient for unit-testing RedisJobQueue
 * without hitting Upstash. Stores raw values in plain JS Maps/Sets/
 * Arrays to mimic Redis data types.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.FakeRedis = void 0;
class FakeRedis {
    hashes = new Map();
    lists = new Map();
    sets = new Map();
    zsets = new Map();
    /** Toggles Redis-error simulation for testing error paths. */
    failNext = new Map();
    maybeFail(op) {
        const err = this.failNext.get(op);
        if (err) {
            this.failNext.delete(op);
            throw new Error(err);
        }
    }
    async hset(key, values) {
        this.maybeFail('hset');
        const h = this.hashes.get(key) ?? {};
        for (const [k, v] of Object.entries(values))
            h[k] = String(v);
        this.hashes.set(key, h);
        return 'OK';
    }
    async hgetall(key) {
        this.maybeFail('hgetall');
        return this.hashes.get(key) ?? null;
    }
    async hdel(key, field) {
        const h = this.hashes.get(key);
        if (!h)
            return 0;
        const fields = Array.isArray(field) ? field : [field];
        let n = 0;
        for (const f of fields)
            if (f in h) {
                delete h[f];
                n++;
            }
        return n;
    }
    async lpush(key, ...values) {
        this.maybeFail('lpush');
        const list = this.lists.get(key) ?? [];
        for (const v of values)
            list.unshift(v);
        this.lists.set(key, list);
        return list.length;
    }
    async rpop(key) {
        this.maybeFail('rpop');
        const list = this.lists.get(key);
        if (!list || list.length === 0)
            return null;
        return list.pop() ?? null;
    }
    async llen(key) {
        return (this.lists.get(key) ?? []).length;
    }
    async lrange(key, start, stop) {
        const list = this.lists.get(key) ?? [];
        const end = stop < 0 ? list.length + stop + 1 : stop + 1;
        return list.slice(start, end);
    }
    async sadd(key, ...members) {
        const set = this.sets.get(key) ?? new Set();
        for (const m of members)
            set.add(m);
        this.sets.set(key, set);
        return set.size;
    }
    async srem(key, ...members) {
        const set = this.sets.get(key);
        if (!set)
            return 0;
        let n = 0;
        for (const m of members)
            if (set.delete(m))
                n++;
        return n;
    }
    async smembers(key) {
        return Array.from(this.sets.get(key) ?? new Set());
    }
    async zadd(key, members) {
        const z = this.zsets.get(key) ?? new Map();
        for (const [m, s] of Object.entries(members))
            z.set(m, s);
        this.zsets.set(key, z);
        return Object.keys(members).length;
    }
    async zrem(key, ...members) {
        const z = this.zsets.get(key);
        if (!z)
            return 0;
        let n = 0;
        for (const m of members)
            if (z.delete(m))
                n++;
        return n;
    }
    async zrangebyscore(key, min, max) {
        const z = this.zsets.get(key);
        if (!z)
            return [];
        const minN = min === '-inf' ? -Infinity : Number(min);
        const maxN = max === '+inf' ? Infinity : Number(max);
        return Array.from(z.entries())
            .filter(([, s]) => s >= minN && s <= maxN)
            .sort((a, b) => a[1] - b[1])
            .map(([m]) => m);
    }
    async zremrangebyscore(key, min, max) {
        const z = this.zsets.get(key);
        if (!z)
            return 0;
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
    async zcard(key) {
        return (this.zsets.get(key) ?? new Map()).size;
    }
    async del(...keys) {
        let n = 0;
        for (const k of keys) {
            let had = false;
            if (this.hashes.delete(k))
                had = true;
            if (this.lists.delete(k))
                had = true;
            if (this.sets.delete(k))
                had = true;
            if (this.zsets.delete(k))
                had = true;
            if (had)
                n++;
        }
        return n;
    }
    async exists(...keys) {
        let n = 0;
        for (const k of keys) {
            if (this.hashes.has(k) || this.lists.has(k) || this.sets.has(k) || this.zsets.has(k))
                n++;
        }
        return n;
    }
    // ── Test helpers ────────────────────────────────────────────────────
    _wipe() {
        this.hashes.clear();
        this.lists.clear();
        this.sets.clear();
        this.zsets.clear();
    }
}
exports.FakeRedis = FakeRedis;
