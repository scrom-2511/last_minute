import { Request, Response } from "express";
import { z } from "zod";
import { returnError } from "../../../helpers/return_calls/error_return.js";
import { BusinessErrorType, ErrorType } from "../../../helpers/return_calls/error_types.js";
import { returnSuccess } from "../../../helpers/return_calls/success_return.js";
import { SuccessStatusCodes } from "../../../helpers/return_calls/status_codes.js";
import { CHUNK_SIZE } from "../../../types/files.js";
import { generateMultipartPresignedUploadUrl } from "../../../services/s3/presinged_urls.js";
import { checkUploadGracePeriodExceeded } from "../../../helpers/hackathons/manager.js";

const reqSchema = z.object({
    hackathonId: z.string(),
    fileHash: z.string(),
});

export const resumeUpload = async (req: Request, res: Response) => {
    try {
        const parse = reqSchema.safeParse(req.body);
        if (!parse.success) return returnError(ErrorType.InvalidRequest, res);

        const { fileHash, hackathonId } = parse.data;

        // Ensures that a user can only resume uploads belonging to their own team
        // TODO: Implement getFileVersionFromUserIdAndHackathonId in database
        const fileVersion = await getFileVersionFromUserIdAndHackathonId(req.userId, hackathonId);

        if (!fileVersion) return returnError(ErrorType.ResourceNotFound, res);

        // Ensures that the same file is resumed which was initiated. Parts from two
        // different files would corrupt the final file.
        if (fileHash !== fileVersion.fileHash) return returnError(ErrorType.InvalidRequest, res);

        // Enforce deadline and grace policy: in-flight uploads that began before deadline
        // are allowed within the grace window, but rejected if beyond grace
        if (await checkUploadGracePeriodExceeded(hackathonId, fileVersion.createdAt))
            return returnError(BusinessErrorType.HackathonDeadlineExceeded, res);

        // Ensures if file is already uploaded, then it should not be resumed, preventing
        // file corruption.
        // TODO: Implement fileAlreadyUploaded in database
        if (fileAlreadyUploaded(fileVersion))
            return returnError(ErrorType.FileAlreadyUploaded, res);

        // TODO: Implement getPendingUploadParts in database
        const pendingUploadParts = await getPendingUploadParts(fileVersion.uploadId);

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
