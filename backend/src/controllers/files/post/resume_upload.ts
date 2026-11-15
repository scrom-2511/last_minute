import { Request, Response } from "express";
import { z } from "zod";
import { getFileVersionFromUserIdAndHackathonId } from "@/database/files.js";
import { fileAlreadyUploaded } from "@/helpers/files/uploads.js";
import { ErrorType } from "@/helpers/return_calls/error_types";
import { returnError } from "@/helpers/return_calls/error_return";
import { returnSuccess } from "@/helpers/return_calls/success_return";
import { SuccessStatusCodes } from "@/helpers/return_calls/status_codes";
import { generateMultipartPresignedUploadUrl } from "@/services/s3/presinged_urls";
import { CHUNK_SIZE } from "@/types/files";
import { getPendingUploadParts } from "@/helpers/files/s3";

const reqSchema = z.object({
    fileHash: z.string(),
});

export const resumeUpload = async (req: Request, res: Response) => {
    try {
        const parse = reqSchema.safeParse(req.body);
        if (!parse.success) return returnError(ErrorType.InvalidRequest, res);

        const { fileHash } = parse.data;

        // Ensures that a user can only resume uploads belonging to their own team
        const fileVersion = await getFileVersionFromUserIdAndHackathonId({
            hackathonId: req.hackathonId!,
            userId: req.userId!,
            fileHash,
        });

        if (!fileVersion) return returnError(ErrorType.ResourceNotFound, res);

        // Ensures that the same file is resumed which was initiated. Parts from two
        // different files would corrupt the final file.
        if (fileHash !== fileVersion.fileHash) return returnError(ErrorType.InvalidRequest, res);

        // Ensures if file is already uploaded, then it should not be resumed, preventing
        // file corruption.
        if (fileAlreadyUploaded(fileVersion)) return returnError(ErrorType.FileAlreadyUploaded, res);

        const pendingUploadParts = await getPendingUploadParts(fileVersion);

        const totalParts = Math.ceil(fileVersion.size / CHUNK_SIZE);

        // S3 hard limit. Also protects against a corrupt or tampered size.
        if (totalParts > 10_000) return returnError(ErrorType.InvalidRequest, res);

        const presignedUploadUrls = await Promise.all(
            pendingUploadParts.map((partNumber: number) => {
                // Signed length must match exactly or S3 rejects the PUT. Every part
                // is CHUNK_SIZE except the last, which holds the remainder.
                const contentLength =
                    partNumber < totalParts
                        ? CHUNK_SIZE
                        : fileVersion.size - (totalParts - 1) * CHUNK_SIZE;

                return generateMultipartPresignedUploadUrl(
                    fileVersion.fileHash,
                    fileVersion.uploadId,
                    partNumber,
                    contentLength,
                );
            }),
        );

        return returnSuccess(
            {
                fileId: fileVersion.fileId,
                uploadId: fileVersion.uploadId,
                pendingParts: pendingUploadParts,
                presignedUploadUrls,
            },
            SuccessStatusCodes.Success,
            res,
        );
    } catch (error) {
        console.error(error);
        return returnError(ErrorType.InternalServerError, res);
    }
};
