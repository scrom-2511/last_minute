import { Request, Response } from "express";
import { z } from "zod";
import { returnError } from "../../../helpers/return_calls/error_return.js";
import { BusinessErrorType, ErrorType } from "../../../helpers/return_calls/error_types.js";
import { checkHackathonDeadlineExceeded } from "../../../helpers/hackathons/manager.js";
import { upsertProjectDetails } from "../../../database/project_details.js";
import { ProjectDetails } from "../../../types/project_details.js";
import { returnSuccess } from "../../../helpers/return_calls/success_return.js";
import { SuccessStatusCodes } from "../../../helpers/return_calls/status_codes.js";

const reqSchema: z.ZodType<ProjectDetails> = z.object({
    name: z.string().min(3),
    description: z.string().min(3),
    links: z.array(z.url()),
});

export const uploadProjectDetails = async (req: Request, res: Response) => {
    try {
        const parse = reqSchema.safeParse(req.body);

        if (!parse.success) {
            return returnError(ErrorType.InvalidRequest, res);
        }

        if (await checkHackathonDeadlineExceeded(req.hackathonId)) {
            return returnError(BusinessErrorType.HackathonDeadlineExceeded, res);
        }

        await upsertProjectDetails(parse.data);

        return returnSuccess("", SuccessStatusCodes.Created, res);
    } catch (err) {
        return returnError(ErrorType.InternalServerError, res);
    }
}