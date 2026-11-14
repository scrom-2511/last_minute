import { Request, Response } from "express";
import { z } from "zod";
import { ErrorType } from "../../../helpers/return_calls/error_types.js";
import { returnError } from "../../../helpers/return_calls/error_return.js";
import { returnSuccess } from "../../../helpers/return_calls/success_return.js";
import { SuccessStatusCodes } from "../../../helpers/return_calls/status_codes.js";

const querySchema = z.object({
    projectId: z.coerce.number().int().positive().optional(),
});

export const getSubmissionStatus = async (req: Request, res: Response) => {
    try {
        const parsed = querySchema.safeParse(req.query);
        if (!parsed.success) return returnError(ErrorType.InvalidRequest, res);

        const { projectId } = parsed.data;

        // Ensure users only inspect status belonging to their team
        // TODO: implement getProjectSubmissionStatus with teamId verification in database
        const projectDetailsStatus = await getProjectSubmissionStatus();

        if (!projectDetailsStatus) return returnError(ErrorType.ResourceNotFound, res);

        return returnSuccess(projectDetailsStatus, SuccessStatusCodes.Success, res);
    } catch (error) {
        console.error(error);
        return returnError(ErrorType.InternalServerError, res);
    }
};
