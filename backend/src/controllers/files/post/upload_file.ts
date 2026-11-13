import { Request, Response } from "express";
import { z } from "zod";
import { returnError } from "../../../helpers/return_calls/error_return.js";
import { ErrorType } from "../../../helpers/return_calls/error_types.js";
import { returnSuccess } from "../../../helpers/return_calls/success_return.js";
import { SuccessStatusCodes } from "../../../helpers/return_calls/status_codes.js";
import { initiateMultipartUpload } from "../../../services/s3/multipart_upload.js";
import { generateMultipartPresignedUploadUrl } from "../../../services/s3/presinged_urls.js";

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

        if (!parsed.success) {
            return returnError(ErrorType.InvalidRequest, res);
        }

        const { hash, extension, hackathonId, mimeType, name, size } = parsed.data;

        const CHUNK_SIZE = 10 * 1024 * 1024;

        const totalParts = Math.ceil(size / CHUNK_SIZE);

        // S3 hard limit. Also protects against a corrupt or tampered size.
        if (totalParts > 10_000) return returnError(ErrorType.InvalidRequest, res);

        const uploadId = await initiateMultipartUpload(hash);
        if (!uploadId) throw new Error("initiate failed");

        // TODO: implement upsertFile
        await upsertFile();

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

        return returnSuccess(urls, SuccessStatusCodes.Created, res);
    } catch (error) {
        console.error(error);
        return returnError(ErrorType.InternalServerError, res);
    }
};
