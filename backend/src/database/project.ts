import { DatabaseErrorType } from "@/helpers/return_calls/error_types";
import { prisma } from "@/prisma/prisma";
import {
    CreateProjectParams,
    GetProjectSubmissionStatusParams,
    UpdateProjectSubmissionStatus,
    UserHackathonParams,
} from "./types";
import { SubmissionStatus } from "@/prisma/generated/prisma/enums";
import { getTeamIdFromUserIdAndHackathonId } from "./teams";
import { cached, cacheDel, cacheGet, cacheSet, keys, TTL } from "./cache/redisCache";
import type { Prisma } from "@/prisma/generated/prisma/client";

type ProjectRow = Prisma.ProjectsGetPayload<object>;

export const upsertProject = async (data: CreateProjectParams) => {
    const teamId = await getTeamIdFromUserIdAndHackathonId(data);

    const { links } = data;

    const project = await prisma.projects.upsert({
        where: { teamId },
        update: {
            title: data.title,
            description: data.description,
            submissionStatus: SubmissionStatus.uploaded,
            links: { createMany: { data: links ?? [] } },
        },
        create: {
            teamId,
            title: data.title,
            description: data.description,
            submissionStatus: SubmissionStatus.uploaded,
            links: { createMany: { data: links ?? [] } },
        },
        include: { links: true },
    });

    // row is cached without links, so invalidate it; set the user -> project pointer
    await Promise.all([
        cacheDel(keys.project(project.id), keys.projectLinks(project.id)),
        cacheSet(keys.userProject(data.hackathonId, data.userId), project.id),
    ]);

    return project;
};

export const getProjectFromUserIdAndHackathonId = async (data: UserHackathonParams) => {
    const { userId, hackathonId } = data;

    const projectId = await cacheGet<number>(keys.userProject(hackathonId, userId));
    if (projectId !== null) {
        const hit = await cacheGet<ProjectRow>(keys.project(projectId));
        if (hit) return hit;
    }

    const project = await prisma.projects.findFirst({
        where: { team: { hackathonId, teamMembers: { some: { memberId: userId } } } },
    });

    if (!project) throw DatabaseErrorType.ProjectNotFound;

    await Promise.all([
        cacheSet(keys.userProject(hackathonId, userId), project.id),
        cacheSet(keys.project(project.id), project),
    ]);

    return project;
};

export const getProjectIdFromUserIdAndHackathonId = async (data: UserHackathonParams) => {
    const project = await getProjectFromUserIdAndHackathonId(data);

    return project.id;
};

export const getTeamIdAndProjectLinks = async (data: UserHackathonParams) => {
    const project = await getProjectFromUserIdAndHackathonId(data);

    const projectLinks = await cached(keys.projectLinks(project.id), TTL.long, () =>
        prisma.links.findMany({
            where: { projectId: project.id },
            select: { link: true, id: true },
        }),
    );

    return { teamId: project.teamId, projectLinks };
};

export const updateProjectSubmissionStatus = async (data: UpdateProjectSubmissionStatus) => {
    const projectId = await cached(keys.fileProject(data.fileId), TTL.long, async () => {
        const file = await prisma.files.findUnique({
            where: { id: data.fileId },
            select: { projectId: true },
        });

        if (!file) throw DatabaseErrorType.FileNotFound;

        return file.projectId;
    });

    const project = await prisma.projects.update({
        where: { id: projectId },
        data: { submissionStatus: data.status },
    });

    await cacheSet(keys.project(project.id), project);

    return project;
};

export const getProjectSubmissionStatus = async (data: GetProjectSubmissionStatusParams) => {
    const { projectId, userId, hackathonId } = data;

    const project = await getProjectFromUserIdAndHackathonId({ userId, hackathonId });

    if (project.id !== projectId) throw DatabaseErrorType.ProjectNotFound;

    return project.submissionStatus;
};

export const updateFailedLinks = async (linkIds: number[]) => {
    if (linkIds.length === 0) return { count: 0 };

    const affected = await prisma.links.findMany({
        where: { id: { in: linkIds } },
        select: { projectId: true },
        distinct: ["projectId"],
    });

    const result = await prisma.links.updateMany({
        where: { id: { in: linkIds } },
        data: {
            status: "needsFix",
            rejectReason: "Link not working. Please fix it.",
        },
    });

    await cacheDel(...affected.map((link) => keys.projectLinks(link.projectId)));

    return result;
};
