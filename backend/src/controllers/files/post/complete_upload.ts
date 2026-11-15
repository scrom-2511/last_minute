import { getFileVersionFromUserIdAndHackathonId, markFileUploaded } from "@/database/files";
import { updateProjectSubmissionStatus } from "@/database/project";
import { returnError } from "@/helpers/return_calls/error_return";
import { ErrorType } from "@/helpers/return_calls/error_types";
import { SuccessStatusCodes } from "@/helpers/return_calls/status_codes";
import { returnSuccess } from "@/helpers/return_calls/success_return";
import { SubmissionStatus } from "@/prisma/generated/prisma/enums";
import { addFileToProcess } from "@/services/bullmq/file_processor/producer";
import { statusEmitter } from "@/services/events/status_emitter";
import { completeMultipartUpload } from "@/services/s3/multipart_upload";
import { Request, Response } from "express";
import z from "zod";

const completedPartSchema = z.object({
    PartNumber: z.number().int().positive(),
    ETag: z.string().min(1),
});

const reqSchema = z.object({
    fileId: z.number().int().positive(),
    uploadId: z.string().min(1),
    fileHash: z.string().min(1),
    parts: z.array(completedPartSchema).min(1),
});

export const completeUpload = async (req: Request, res: Response) => {
    try {
        const parsed = reqSchema.safeParse(req.body);
        if (!parsed.success) return returnError(ErrorType.InvalidRequest, res);

        const { fileId, uploadId, fileHash, parts } = parsed.data;

        // Verify file version exists and belongs to requesting team
        const fileVersion = await getFileVersionFromUserIdAndHackathonId({
            hackathonId: req.hackathonId!,
            userId: req.userId!,
            fileHash,
        });

        // Sort parts ascending by PartNumber as required by S3 CompleteMultipartUpload spec
        const sortedParts = [...parts].sort((a, b) => a.PartNumber - b.PartNumber);

        // Finalize multipart upload on S3 directly without proxying the file bytes
        await completeMultipartUpload(fileHash, uploadId, sortedParts);

        await markFileUploaded({
            fileVersionId: fileVersion.id,
            hackathonId: Number(req.hackathonId),
            userId: Number(req.userId),
        });

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
        await updateProjectSubmissionStatus({
            fileId: fileVersion.fileId,
            hackathonId: req.hackathonId!,
            userId: req.userId!,
            status: SubmissionStatus.checking,
        });

        statusEmitter.emit(`project:${fileId}`, {
            projectId: fileId,
            status: SubmissionStatus.checking,
        });

        return returnSuccess(
            {
                fileId,
                status: SubmissionStatus.checking,
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
