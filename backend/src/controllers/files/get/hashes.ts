import { Request, Response } from "express";
import { returnError } from "../../../helpers/return_calls/error_return.js";
import { ErrorType } from "../../../helpers/return_calls/error_types.js";
import { getFileHashes } from "../../../database/files.js";
import { returnSuccess } from "../../../helpers/return_calls/success_return.js";
import { SuccessStatusCodes } from "../../../helpers/return_calls/status_codes.js";

export const fileHashes = async (req: Request, res: Response) => {
    try {
        const fileId = req.query.fileId;

        if (!fileId) {
            return returnError(ErrorType.InvalidRequest, res);
        }

        const fileHashes = await getFileHashes(fileId as string);

        if (!fileHashes) {
            return returnError(ErrorType.ResourceNotFound, res);
        }

        return returnSuccess(fileHashes, SuccessStatusCodes.Success, res);
    } catch (error) {
        return returnError(ErrorType.InternalServerError, res);
    }
}