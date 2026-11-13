import { Request, Response } from "express";
import { z } from "zod";
import { returnError } from "../../../helpers/return_calls/error_return.js";
import { ErrorType } from "../../../helpers/return_calls/error_types.js";
import { returnSuccess } from "../../../helpers/return_calls/success_return.js";
import { SuccessStatusCodes } from "../../../helpers/return_calls/status_codes.js";
import { CHUNK_SIZE } from "../../../types/files.js";
import { generateMultipartPresignedUploadUrl } from "../../../services/s3/presinged_urls.js";

const reqSchema = z.object({
    hackathonId: z.string(),
    fileHash: z.string(),
});

export const resumeUpload = async (req: Request, res: Response) => {
    try {
        const parse = reqSchema.safeParse(req.body);
        if (!parse.success) {
            return returnError(ErrorType.InvalidRequest, res);
        }
        const { fileHash, hackathonId } = parse.data;

        // Ensures that an user can only resume uploads belonging to his own team.
        // TODO: Implement getFileVersionFromUserIdAndHackathonId
        const fileVersion = await getFileVersionFromUserIdAndHackathonId(req.userId, hackathonId);

        if (!fileVersion) return returnError(ErrorType.ResourceNotFound, res);

        // Ensures that the same file is resumed which was initiated. Parts from two
        // different files would corrupt the final file.
        if (fileHash != fileVersion.fileHash) return returnError(ErrorType.InvalidRequest, res);

        // Ensures if file is already uploaded, then is should not be resumed, prevents
        // file corruption.
        // TODO: Implement fileAlreadyUploaded
        if (fileAlreadyUploaded(fileVersion))
            return returnError(ErrorType.FileAlreadyUploaded, res);

        // TODO: Implement getPendingUploadParts
        const pendingUploadParts = await getPendingUploadParts();

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

        return returnSuccess(presignedUploadUrls, SuccessStatusCodes.Success, res);
    } catch (error) {
        console.error(error);
        return returnError(ErrorType.InternalServerError, res);
    }
};
