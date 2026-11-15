import { Redis } from "ioredis";
import superjson from "superjson";

export const TTL = { short: 60, long: 3600 };

export const keys = {
    hackathonDeadline: (hackathonId: number) => `hackathon:${hackathonId}:deadline`,
    team: (hackathonId: number, userId: number) => `team:${hackathonId}:${userId}`,
    userProject: (hackathonId: number, userId: number) => `project:uh:${hackathonId}:${userId}`,
    project: (projectId: number) => `project:${projectId}`,
    projectLinks: (projectId: number) => `project:${projectId}:links`,
    fileProject: (fileId: number) => `file:${fileId}:project`,
    fileVersion: (fileId: number, version: number) => `fileversion:${fileId}:${version}`,
    fileVersionLookup: (projectId: number, fileHash: string) =>
        `fileversion:lookup:${projectId}:${fileHash}`,
    organizerStats: (hackathonId: number, userId: number) => `stats:${hackathonId}:${userId}`,
    csvExport: (hackathonId: number, userId: number) => `csv:${hackathonId}:${userId}`,
};

const redis = new Redis({
    host: "127.0.0.1",
    port: 6379,
    maxRetriesPerRequest: null,
});

export const cacheGet = async <T>(key: string): Promise<T | null> => {
    try {
        const raw = await redis.get(key);
        return raw ? (superjson.parse(raw) as T) : null;
    } catch {
        return null;
    }
};

export const cacheSet = async (key: string, value: unknown, ttl = TTL.long) => {
    try {
        await redis.set(key, superjson.stringify(value), "EX", ttl);
    } catch {
        /* ignore */
    }
};

export const cacheDel = async (...cacheKeys: string[]) => {
    if (cacheKeys.length === 0) return;
    try {
        await redis.del(...cacheKeys);
    } catch {}
};

// Read-through. If `load` throws (not found), nothing is cached.
export const cached = async <T>(key: string, ttl: number, load: () => Promise<T>): Promise<T> => {
    const hit = await cacheGet<T>(key);
    if (hit !== null) return hit;

    const value = await load();
    await cacheSet(key, value, ttl);
    return value;
};
