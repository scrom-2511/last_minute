import { Queue } from "bullmq";
import { redisConnection } from "./redisClient.js";

export const LINK_VERIFIER_QUEUE_NAME = "links_verifier";
export const linksQueue = new Queue(LINK_VERIFIER_QUEUE_NAME, {
    connection: redisConnection,
});
