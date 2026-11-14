import { Request, Response } from "express";
import { z } from "zod";
import { returnError } from "../../../helpers/return_calls/error_return.js";
import { BusinessErrorType, ErrorType } from "../../../helpers/return_calls/error_types.js";
import { returnSuccess } from "../../../helpers/return_calls/success_return.js";
import { SuccessStatusCodes } from "../../../helpers/return_calls/status_codes.js";
import { checkHackathonDeadlineExceeded } from "../../../helpers/hackathons/manager.js";
import { addLinksToVerify } from "../../../services/bullmq/link_verifier/producer.js";
import { SubmissionStatus } from "../../../types/project_details.js";
import { statusEmitter } from "../../../services/events/status_emitter.js";

const reqSchema = z.object({
    name: z.string().min(3),
    description: z.string().min(3),
    links: z.array(z.string().url()),
    hackathonId: z.string(),
    projectId: z.number().optional(),
});

export const uploadProjectDetails = async (req: Request, res: Response) => {
    try {
        const parse = reqSchema.safeParse(req.body);
        if (!parse.success) return returnError(ErrorType.InvalidRequest, res);

        const { name, description, links, hackathonId, projectId } = parse.data;

        // Submissions and edits to project details are blocked once the deadline passes
        if (await checkHackathonDeadlineExceeded(hackathonId))
            return returnError(BusinessErrorType.HackathonDeadlineExceeded, res);

        // TODO: implement upsertProjectDetails in database
        const savedProjectId = await upsertProjectDetails();

        // Enqueue submitted URLs to BullMQ for SSRF and liveliness checking
        if (links.length > 0)
            await addLinksToVerify(
                links.map((link, i) => ({
                    id: `${savedProjectId}-${i}`,
                    link,
                })),
            );

        // TODO: implement updateProjectSubmissionStatus in database
        await updateProjectSubmissionStatus();

        // Push live status update to connected clients
        statusEmitter.emit(`project:${savedProjectId}`, {
            projectId: savedProjectId,
            status: SubmissionStatus.Checking,
        });

        return returnSuccess(
            {
                projectId: savedProjectId,
                status: SubmissionStatus.Checking,
                message: "Project details saved and links queued for verification",
            },
            SuccessStatusCodes.Created,
            res,
        );
    } catch (error) {
        console.error(error);
        return returnError(ErrorType.InternalServerError, res);
    }
};
