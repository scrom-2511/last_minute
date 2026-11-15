import { prisma } from "@/prisma/prisma";
import { UserHackathonParams } from "./types";

export const getSubmissionsForCsvExport = async (data: UserHackathonParams) => {
    const { userId, hackathonId } = data;

    return await prisma.projects.findMany({
        where: {
            team: {
                hackathonId,
                hackathon: {
                    organizers: { some: { userId } },
                },
            },
        },
        select: {
            id: true,
            title: true,
            description: true,
            teamId: true,
            submissionStatus: true,
            team: { select: { id: true, name: true } },
            links: { select: { link: true, name: true, status: true } },
            updatedAt: true,
        },
    });
};

export const getOrganizerStats = async (data: UserHackathonParams) => {
    const { userId, hackathonId } = data;

    const projects = await prisma.projects.findMany({
        where: { team: { hackathonId, teamMembers: { some: { memberId: userId } } } },
        select: { submissionStatus: true },
    });

    const lateAttempts = await prisma.lateAttempts.findMany({
        where: { hackathonId },
    });

    let submissions = 0;
    let failedChecks = 0;

    for (const submission of projects) if (submission.submissionStatus !== "needsFix") submissions += 1;
        else failedChecks += 1;
    

    return { submissions, failedChecks, lateAttempts: lateAttempts.length };
};
