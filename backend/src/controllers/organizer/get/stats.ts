import { Request, Response } from "express";
import { z } from "zod";
import { returnError } from "../../../helpers/return_calls/error_return.js";
import { ErrorType } from "../../../helpers/return_calls/error_types.js";
import { returnSuccess } from "../../../helpers/return_calls/success_return.js";
import { SuccessStatusCodes } from "../../../helpers/return_calls/status_codes.js";

const querySchema = z.object({
    hackathonId: z.string().min(1),
});

// Returns live dashboard counts of submissions, late attempts, and failed checks
export const getOrganizerDashboardStats = async (req: Request, res: Response) => {
    try {
        const parsed = querySchema.safeParse(req.query);
        if (!parsed.success) return returnError(ErrorType.InvalidRequest, res);

        const { hackathonId } = parsed.data;

        // TODO: implement getOrganizerStats in database
        const stats = await getOrganizerStats();

        return returnSuccess(stats, SuccessStatusCodes.Success, res);
    } catch (error) {
        console.error(error);
        return returnError(ErrorType.InternalServerError, res);
    }
};
