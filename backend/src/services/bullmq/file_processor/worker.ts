import { Worker } from "bullmq";
import {
    FileProcessJobData,
    LOCAL_FILES_DOWNLOAD_PREFIX,
    LOCAL_FILES_PREVIEW_PREFIX,
} from "../../../types/files.js";
import {
    createFileFromBuffer,
    processPdfFile,
    processZipFile,
} from "../../../helpers/files/file_processor.js";
import { downloadFromS3, uploadToS3 } from "../../s3/upload_download.js";
import path from "node:path";
import { redisConnection } from "../redisClient.js";

const worker = new Worker(
    "process-file",
    async (job) => {
        const jobData: FileProcessJobData = job.data;

        const { fileId, extension } = jobData;
        const downloadedFile = await downloadFromS3(fileId);
        await createFileFromBuffer(downloadedFile, fileId.toString(), extension);

        const filePath = path.join(LOCAL_FILES_DOWNLOAD_PREFIX, `${fileId}.${extension}`);

        // Route validation and preview extraction based on file format
        const result =
            extension === "zip"
                ? await processZipFile(filePath, fileId)
                : await processPdfFile(filePath, fileId.toString());

        // TODO: implement setFileValidationFailed
        // Abort processing and record failure if the file is invalid, corrupt, or hostile
        if (!result.ok) return await setFileValidationFailed(fileId, result.reason);

        // Upload extracted preview (.md for zip, .png for pdf) to S3 for frontend display
        const previewFileName = `${fileId}-preview.${extension === "zip" ? "md" : "png"}`;
        const previewFileFullPath = path.join(LOCAL_FILES_PREVIEW_PREFIX, previewFileName);

        if (previewFileName) return await uploadToS3(previewFileFullPath, previewFileName);
    },
    // Restrict concurrency to prevent CPU and memory exhaustion from parallel renders
    { connection: redisConnection, concurrency: 3 },
);
