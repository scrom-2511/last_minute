import { prisma } from "@/prisma/prisma";
import { UserHackathonParams } from "./types";
import { cached, keys, TTL } from "./cache/redisCache";

export const getSubmissionsForCsvExport = (data: UserHackathonParams) => {
    const { userId, hackathonId } = data;

    return cached(keys.csvExport(hackathonId, userId), TTL.short, () =>
        prisma.projects.findMany({
            where: {
                team: { hackathonId, hackathon: { organizers: { some: { userId } } } },
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
        }),
    );
};

export const getOrganizerStats = (data: UserHackathonParams) => {
    const { userId, hackathonId } = data;

    return cached(keys.organizerStats(hackathonId, userId), TTL.short, async () => {
        const [projects, lateAttempts] = await Promise.all([
            prisma.projects.findMany({
                where: { team: { hackathonId, teamMembers: { some: { memberId: userId } } } },
                select: { submissionStatus: true },
            }),
            prisma.lateAttempts.count({ where: { hackathonId } }),
        ]);

        let submissions = 0;
        let failedChecks = 0;

        for (const submission of projects) {
            if (submission.submissionStatus !== "needsFix") submissions += 1;
            else failedChecks += 1;
        }

        return { submissions, failedChecks, lateAttempts };
    });
};
