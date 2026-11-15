import { prisma } from "@/prisma/prisma";
import { UserHackathonParams } from "./types";
import { DatabaseErrorType } from "@/helpers/return_calls/error_types";
import { cached, keys, TTL } from "./cache/redisCache";

export const getTeamFromUserIdAndHackathonId = (data: UserHackathonParams) =>
    cached(keys.team(data.hackathonId, data.userId), TTL.long, async () => {
        const team = await prisma.teams.findFirst({
            where: {
                hackathonId: data.hackathonId,
                teamMembers: { some: { memberId: data.userId } },
            },
        });

        if (!team) throw DatabaseErrorType.NotATeamMember;

        return team;
    });

export const getTeamIdFromUserIdAndHackathonId = async (data: UserHackathonParams) => {
    const team = await getTeamFromUserIdAndHackathonId(data);

    return team.id;
};
