import { Request, Response } from "express";
import { z } from "zod";
import { SubmissionStatus } from "../../../types/project_details.js";
import { returnError } from "../../../helpers/return_calls/error_return.js";
import { ErrorType } from "../../../helpers/return_calls/error_types.js";
import { returnSuccess } from "../../../helpers/return_calls/success_return.js";
import { SuccessStatusCodes } from "../../../helpers/return_calls/status_codes.js";
import { statusEmitter } from "../../../services/events/status_emitter.js";

const reqSchema = z.object({
    projectId: z.number().int().positive(),
    submissionStatus: z.enum([
        SubmissionStatus.Uploading,
        SubmissionStatus.Uploaded,
        SubmissionStatus.NeedsFix,
        SubmissionStatus.Accepted,
        SubmissionStatus.Checking,
    ]),
});

export const updateSubmissionStatus = async (req: Request, res: Response) => {
    try {
        const parsed = reqSchema.safeParse(req.body);
        if (!parsed.success) return returnError(ErrorType.InvalidRequest, res);

        const { projectId, submissionStatus } = parsed.data;

        // Verify project existence and user/worker permissions
        // TODO: implement getProjectByProjectIdAndUserId in database
        const project = await getProjectByProjectIdAndUserId();
        if (!project) return returnError(ErrorType.ResourceNotFound, res);

        // TODO: implement updateProjectSubmissionStatus in database
        await updateStatusInDb();

        // Notify live listeners connected via Server-Sent Events without requiring page refresh
        statusEmitter.emit(`project:${projectId}`, {
            projectId,
            status: submissionStatus,
            updatedAt: Math.floor(Date.now() / 1000),
        });

        return returnSuccess(
            { projectId, status: submissionStatus },
            SuccessStatusCodes.Success,
            res,
        );
    } catch (error) {
        console.error(error);
        return returnError(ErrorType.InternalServerError, res);
    }
};
