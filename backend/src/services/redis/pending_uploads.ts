import { connectRedis, redisClient } from "./client.js";

export const pendingUploadsRedis = "pending_uploads";

export const createPendingUploads = async (fileId: string, hashes: string[]) => {
    await connectRedis();
    await redisClient.sAdd(`${pendingUploadsRedis}:${fileId}`, hashes);
};

export const removeAfterUploaded = async (fileId: string, hash: string) => {
    await connectRedis();
    await redisClient.sRem(`${pendingUploadsRedis}:${fileId}`, hash);
}

export const deletePendingUploads = async (fileId: string) => {
    await connectRedis();
    await redisClient.del(`${pendingUploadsRedis}:${fileId}`);
}