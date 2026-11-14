import { FileProcessJobData } from "../../../types/files.js";
import { fileQueue } from "../queues.js";

// Enqueues background file validation and preview generation job
export const addFileToProcess = async (data: FileProcessJobData) => {
    await fileQueue.add("process-file", data, {
        attempts: 5,
        backoff: {
            type: "exponential",
            delay: 1000,
        },
    });
};
