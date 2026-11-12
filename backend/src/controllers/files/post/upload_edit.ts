import { Request, Response } from "express";
import { z } from "zod";
import { returnError } from "../../../helpers/return_calls/error_return.js";
import { ErrorType } from "../../../helpers/return_calls/error_types.js";
import { hashesToBytes } from "../../../helpers/files/hash.js";
import { getPresignedUploadUrl } from "../../../services/s3/presinged_urls.js";
import { returnSuccess } from "../../../helpers/return_calls/success_return.js";
import { SuccessStatusCodes } from "../../../helpers/return_calls/status_codes.js";
import { createPendingUploads, deletePendingUploads } from "../../../services/redis/pending_uploads.js";
import { createRevision, deleteRevision } from "../../../database/files.js";

const reqSchema = z.object({
    hashes: z.array(z.string()),
    positions: z.array(z.number()),
    fileId: z.string(),
})

export const uploadEdit = async (req: Request, res: Response) => {
    try {
        const body = req.body;

        const parsed = reqSchema.safeParse(body);

        if (!parsed.success) {
            return returnError(ErrorType.InvalidRequest, res);
        }

        const { fileId, hashes, positions } = parsed.data;

        const hashBytes = hashesToBytes(hashes);

        const [fileRes, urlsRes, pendingRes] = await Promise.allSettled([
            createRevision(fileId, hashBytes, positions),
            Promise.all(hashes.map(getPresignedUploadUrl)),
            createPendingUploads(fileId, hashes),
        ]);

        if (fileRes.status === "rejected" || urlsRes.status === "rejected" || pendingRes.status === "rejected") {
            if (fileRes.status === "fulfilled") await deleteRevision(fileId).catch(console.error);
            if (pendingRes.status === "fulfilled") await deletePendingUploads(fileId).catch(console.error);
            throw new Error();
        }

        return returnSuccess(urlsRes.value as string[], SuccessStatusCodes.Created, res);
    } catch (error) {
        console.log(error);
        return returnError(ErrorType.InternalServerError, res);
    }
}