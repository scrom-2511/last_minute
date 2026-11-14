import { Request, Response } from "express";
import { z } from "zod";
import { returnError } from "../../../helpers/return_calls/error_return.js";
import { BusinessErrorType, ErrorType } from "../../../helpers/return_calls/error_types.js";
import { returnSuccess } from "../../../helpers/return_calls/success_return.js";
import { SuccessStatusCodes } from "../../../helpers/return_calls/status_codes.js";
import { initiateMultipartUpload } from "../../../services/s3/multipart_upload.js";
import { generateMultipartPresignedUploadUrl } from "../../../services/s3/presinged_urls.js";
import { checkHackathonDeadlineExceeded } from "../../../helpers/hackathons/manager.js";
import { CHUNK_SIZE } from "../../../types/files.js";

const MAX_FILE_BYTES = 100 * 1024 * 1024; // 100 MB max file cap

const reqSchema = z.object({
    hash: z.string(),
    hackathonId: z.number(),
    name: z.string(),
    mimeType: z.string(),
    size: z.number(),
    extension: z.string(),
});

export const uploadFile = async (req: Request, res: Response) => {
    try {
        const parsed = reqSchema.safeParse(req.body);

        if (!parsed.success) return returnError(ErrorType.InvalidRequest, res);

        const { hash, extension, hackathonId, mimeType, name, size } = parsed.data;

        // Reject uploads exceeding the 100 MB cap
        if (size > MAX_FILE_BYTES || size <= 0) return returnError(ErrorType.InvalidRequest, res);

        // Reject new uploads initiated after the deadline
        if (await checkHackathonDeadlineExceeded(hackathonId.toString()))
            return returnError(BusinessErrorType.HackathonDeadlineExceeded, res);

        const totalParts = Math.ceil(size / CHUNK_SIZE);

        // S3 hard limit. Also protects against a corrupt or tampered size.
        if (totalParts > 10_000) return returnError(ErrorType.InvalidRequest, res);

        const uploadId = await initiateMultipartUpload(hash);
        if (!uploadId) throw new Error("initiate failed");

        // TODO: implement upsertFile in database
        const fileId = await upsertFile();

        // Keep every version; create a new file version record in database
        // TODO: Implement createNewFileVersion in database
        const newVersion = await createNewFileVersion();

        const urls = await Promise.all(
            Array.from({ length: totalParts }, (_, i) => {
                // Part numbers are 1-based for S3. We map array index `i` to `i + 1`.
                const partNumber = i + 1;

                // Signed length must match exactly or S3 rejects the PUT. Every part
                // is CHUNK_SIZE except the last, which holds the remainder.
                const contentLength =
                    partNumber < totalParts ? CHUNK_SIZE : size - (totalParts - 1) * CHUNK_SIZE;

                return generateMultipartPresignedUploadUrl(
                    hash,
                    uploadId,
                    partNumber,
                    contentLength,
                );
            }),
        );

        return returnSuccess(
            { fileId, uploadId, urls, version: newVersion },
            SuccessStatusCodes.Created,
            res,
        );
    } catch (error) {
        console.error(error);
        return returnError(ErrorType.InternalServerError, res);
    }
};
