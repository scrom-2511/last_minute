import { Request, Response } from "express";
import { z } from "zod";
import { returnError } from "../../../helpers/return_calls/error_return.js";
import { BusinessErrorType, ErrorType } from "../../../helpers/return_calls/error_types.js";
import { returnSuccess } from "../../../helpers/return_calls/success_return.js";
import { SuccessStatusCodes } from "../../../helpers/return_calls/status_codes.js";
import { completeMultipartUpload } from "../../../services/s3/multipart_upload.js";
import { checkUploadGracePeriodExceeded } from "../../../helpers/hackathons/manager.js";
import { addFileToProcess } from "../../../services/bullmq/file_processor/producer.js";
import { SubmissionStatus } from "../../../types/project_details.js";
import { statusEmitter } from "../../../services/events/status_emitter.js";

const completedPartSchema = z.object({
    PartNumber: z.number().int().positive(),
    ETag: z.string().min(1),
});

const reqSchema = z.object({
    fileId: z.number().int().positive(),
    uploadId: z.string().min(1),
    fileHash: z.string().min(1),
    hackathonId: z.string(),
    parts: z.array(completedPartSchema).min(1),
});

export const completeUpload = async (req: Request, res: Response) => {
    try {
        const parsed = reqSchema.safeParse(req.body);
        if (!parsed.success) return returnError(ErrorType.InvalidRequest, res);

        const { fileId, uploadId, fileHash, hackathonId, parts } = parsed.data;

        // Verify file version exists and belongs to requesting team
        // TODO: Implement getFileVersionFromUserIdAndHackathonId in database
        const fileVersion = await getFileVersionFromUserIdAndHackathonId();
        if (!fileVersion) return returnError(ErrorType.ResourceNotFound, res);

        // Check if upload completion is within the grace period
        if (await checkUploadGracePeriodExceeded(hackathonId, fileVersion.createdAt)) return returnError(BusinessErrorType.HackathonDeadlineExceeded, res);

        // Sort parts ascending by PartNumber as required by S3 CompleteMultipartUpload spec
        const sortedParts = [...parts].sort((a, b) => a.PartNumber - b.PartNumber);

        // Finalize multipart upload on S3 directly without proxying the file bytes
        await completeMultipartUpload(fileHash, uploadId, sortedParts);

        // TODO: Implement markFileUploaded in database
        await markFileUploaded();

        // Enqueue background processing job for content validation and preview generation
        await addFileToProcess({
            fileId,
            name: `${fileId}`,
            mimeType: "application/octet-stream",
            size: fileVersion.size,
            extension: "zip",
            s3Url: fileHash,
            version: fileVersion.version,
        });

        // Update submission status to Checking and notify live listeners
        // TODO: Implement updateProjectSubmissionStatus in database
        await updateProjectSubmissionStatus();
        statusEmitter.emit(`project:${fileId}`, {
            projectId: fileId,
            status: SubmissionStatus.Checking,
        });

        return returnSuccess(
            {
                fileId,
                status: SubmissionStatus.Checking,
                message: "Upload completed and background checks initiated",
            },
            SuccessStatusCodes.Success,
            res,
        );
    } catch (error) {
        console.error(error);
        return returnError(ErrorType.InternalServerError, res);
    }
};
