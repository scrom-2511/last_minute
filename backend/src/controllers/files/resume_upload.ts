import { Request, Response } from "express";
import { z } from "zod";
import { returnError } from "../../helpers/return_calls/error_return.js";
import { BusinessErrorType, ErrorType } from "../../helpers/return_calls/error_types.js";
import { getPendingUploads, isFilePresent } from "../../services/redis/pending_uploads.js";
import { returnSuccess } from "../../helpers/return_calls/success_return.js";
import { SuccessStatusCodes } from "../../helpers/return_calls/status_codes.js";
import { checkHackathonDeadlineExceeded } from "../../helpers/hackathons/manager.js";

const reqSchema = z.object({
    fileId: z.string(),
    hackathonId: z.string(),
})

export const resumeUpload = async (req: Request, res: Response) => {
    try {
        const parse = reqSchema.safeParse(req.body);

        if (!parse.success) {
            return returnError(ErrorType.InvalidRequest, res);
        }

        const { fileId, hackathonId } = parse.data;

        if (await checkHackathonDeadlineExceeded(hackathonId)) {
            return returnError(BusinessErrorType.HackathonDeadlineExceeded, res);
        }

        if (!await isFilePresent(fileId)) {
            return returnError(ErrorType.ResourceNotFound, res);
        }

        const pendingUploadHashes = await getPendingUploads(fileId);
        const presignedUploadUrls = await Promise.all(pendingUploadHashes.map(getPendingUploads));

        return returnSuccess(presignedUploadUrls, SuccessStatusCodes.Success, res);
    } catch (error) {
        return returnError(ErrorType.InternalServerError, res);
    }
}