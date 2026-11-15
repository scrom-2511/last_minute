import { Request, Response } from "express";
import { z } from "zod";
import { returnError } from "@/helpers/return_calls/error_return";
import { ErrorType } from "@/helpers/return_calls/error_types";
import { returnSuccess } from "@/helpers/return_calls/success_return";
import { SuccessStatusCodes } from "@/helpers/return_calls/status_codes";
import { addLinksToVerify } from "@/services/bullmq/link_verifier/producer";
import { statusEmitter } from "@/services/events/status_emitter";
import { updateProjectSubmissionStatus, upsertProject } from "@/database/project";
import { SubmissionStatus } from "@/prisma/generated/prisma/enums";
import { getProjectsLinksToAdd } from "@/helpers/project_details/links";

const linkSchema = z.object({
    name: z.string().min(1),
    link: z.url(),
});

const reqSchema = z.object({
    title: z.string().min(3),
    description: z.string().min(3),
    links: linkSchema.array(),
    hackathonId: z.string(),
});

export const uploadProjectDetails = async (req: Request, res: Response) => {
    try {
        const parse = reqSchema.safeParse(req.body);
        if (!parse.success) return returnError(ErrorType.InvalidRequest, res);

        const { title, description, links } = parse.data;

        const linksToAdd = await getProjectsLinksToAdd({
            links,
            hackathonId: req.hackathonId,
            userId: req.userId,
        });

        const linksToAddArr = linksToAdd.map((linkWithName) => linkWithName.link);

        const savedProject = await upsertProject({
            userId: req.userId,
            hackathonId: req.hackathonId,
            links: linksToAdd,
            title,
            description,
        });

        const newLinksWithIds = savedProject.links.flatMap((link) =>
            linksToAddArr.includes(link.link) ? [{ id: link.id, link: link.link }] : [],
        );

        // Enqueue submitted URLs to BullMQ for SSRF and liveliness checking
        if (linksToAddArr.length > 0)
            await addLinksToVerify(
                newLinksWithIds.map((linkWithId) => ({
                    id: linkWithId.id,
                    link: linkWithId.link,
                })),
            );

        await updateProjectSubmissionStatus({
            projectId: savedProject.id,
            hackathonId: req.hackathonId,
            userId: req.userId,
            status: SubmissionStatus.uploaded,
        });

        // Push live status update to connected clients
        statusEmitter.emit(`project:${savedProject}`, {
            projectId: savedProject,
            status: SubmissionStatus.uploaded,
        });

        return returnSuccess(
            {
                projectId: savedProject,
                status: SubmissionStatus.checking,
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
