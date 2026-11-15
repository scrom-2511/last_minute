import { Request, Response } from "express";
import { z } from "zod";
import { returnError } from "@/helpers/return_calls/error_return";
import { ErrorType } from "@/helpers/return_calls/error_types";
import { CHUNK_SIZE } from "@/types/files";
import { initiateMultipartUpload } from "@/services/s3/multipart_upload";
import { upsertFileAndCreateNewFileVersion } from "@/database/files";
import { SuccessStatusCodes } from "@/helpers/return_calls/status_codes";
import { returnSuccess } from "@/helpers/return_calls/success_return";
import { generateMultipartPresignedUploadUrl } from "@/services/s3/presinged_urls";
import { Extension } from "@/prisma/generated/prisma/enums";

const MAX_FILE_BYTES = 100 * 1024 * 1024; // 100 MB max file cap

const reqSchema = z.object({
    hash: z.string(),
    name: z.string(),
    mimeType: z.string(),
    size: z.number(),
    fileId: z.string().optional(),
    extension: z.enum(Extension),
});

export const uploadFile = async (req: Request, res: Response) => {
    try {
        const parsed = reqSchema.safeParse(req.body);

        if (!parsed.success) return returnError(ErrorType.InvalidRequest, res);

        const { hash: fileHash, mimeType, name: fileName, size, extension } = parsed.data;

        // Reject uploads exceeding the 100 MB cap
        if (size > MAX_FILE_BYTES || size <= 0) return returnError(ErrorType.InvalidRequest, res);

        const totalParts = Math.ceil(size / CHUNK_SIZE);

        // S3 hard limit. Also protects against a corrupt or tampered size.
        if (totalParts > 10_000) return returnError(ErrorType.InvalidRequest, res);

        const uploadId = await initiateMultipartUpload(fileHash);
        if (!uploadId) throw new Error("initiate failed");

        // Upsert file and create new file version
        const file = await upsertFileAndCreateNewFileVersion({
            fileHash,
            extension: extension,
            hackathonId: Number(req.hackathonId),
            userId: Number(req.userId),
            mimeType,
            name: fileName,
            size,
            uploadId,
        });

        const urls = await Promise.all(
            Array.from({ length: totalParts }, (_, i) => {
                // Part numbers are 1-based for S3. We map array index `i` to `i + 1`.
                const partNumber = i + 1;

                // Signed length must match exactly or S3 rejects the PUT. Every part
                // is CHUNK_SIZE except the last, which holds the remainder.
                const contentLength =
                    partNumber < totalParts ? CHUNK_SIZE : size - (totalParts - 1) * CHUNK_SIZE;

                return generateMultipartPresignedUploadUrl(
                    fileHash,
                    uploadId,
                    partNumber,
                    contentLength,
                );
            }),
        );

        return returnSuccess(
            { fileId: file.id, uploadId, urls, version: file.version },
            SuccessStatusCodes.Created,
            res,
        );
    } catch (error) {
        return returnError(ErrorType.InternalServerError, res);
    }
};
