import { DatabaseErrorType } from "@/helpers/return_calls/error_types";
import { prisma } from "../prisma/prisma";
import {
    CreateProjectParams,
    GetProjectSubmissionStatusParams,
    UpdateProjectSubmissionStatus,
    UserHackathonParams,
} from "./types";
import { SubmissionStatus } from "@/prisma/generated/prisma/enums";
import { getTeamIdFromUserIdAndHackathonId } from "./teams";

export const upsertProject = async (data: CreateProjectParams) => {
    const teamId = await getTeamIdFromUserIdAndHackathonId(data);

    const { links } = data;

    return prisma.projects.upsert({
        where: {
            teamId,
        },
        update: {
            title: data.title,
            description: data.description,
            submissionStatus: SubmissionStatus.uploaded,
            links: {
                createMany: {
                    data: links ?? [],
                },
            },
        },
        create: {
            teamId,
            title: data.title,
            description: data.description,
            submissionStatus: SubmissionStatus.uploaded,
            links: {
                createMany: {
                    data: links ?? [],
                },
            },
        },
    });
};

export const getTeamIdAndProjectLinks = async (data: UserHackathonParams) => {
    const { userId, hackathonId } = data;

    const project = await prisma.projects.findFirst({
        where: { team: { hackathonId, teamMembers: { some: { memberId: userId } } } },
        select: { teamId: true, links: { select: { link: true } } },
    });

    if (!project) throw DatabaseErrorType.ProjectNotFound;

    return { teamId: project.teamId, projectLinks: project.links };
};

export const getProjectFromUserIdAndHackathonId = async (data: UserHackathonParams) => {
    const { userId, hackathonId } = data;

    const project = await prisma.projects.findFirst({
        where: {
            team: {
                hackathonId,
                teamMembers: { some: { memberId: userId } },
            },
        },
    });

    if (!project) throw DatabaseErrorType.ProjectNotFound;

    return project;
};

export const getProjectIdFromUserIdAndHackathonId = async (data: UserHackathonParams) => {
    const project = await getProjectFromUserIdAndHackathonId(data);

    return project.id;
};

export const updateProjectSubmissionStatus = async (data: UpdateProjectSubmissionStatus) => {
    const file = await prisma.files.findUnique({
        where: { id: data.fileId },
        select: { projectId: true },
    });

    if (!file) throw DatabaseErrorType.FileNotFound;

    return prisma.projects.update({
        where: { id: file.projectId },
        data: {
            submissionStatus: data.status,
        },
    });
};

export const getProjectSubmissionStatus = async (data: GetProjectSubmissionStatusParams) => {
    const { projectId, userId, hackathonId } = data;

    const project = await prisma.projects.findUnique({
        where: {
            id: projectId,
            team: { hackathonId, teamMembers: { some: { memberId: userId } } },
        },
    });

    if (!project) throw DatabaseErrorType.ProjectNotFound;

    return project.submissionStatus;
};

export const updateFailedLinks = async (linkIds: number[]) => {
    if (linkIds.length === 0) return { count: 0 };

    return await prisma.links.updateMany({
        where: {
            id: { in: linkIds },
        },
        data: {
            status: "needsFix",
            rejectReason: "Link not working. Please fix it.",
        },
    });
};
