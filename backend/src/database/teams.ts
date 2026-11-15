import { prisma } from "@/prisma/prisma";
import { UserHackathonParams } from "./types";
import { DatabaseErrorType } from "@/helpers/return_calls/error_types";

export const getTeamFromUserIdAndHackathonId = async (data: UserHackathonParams) => {
    const team = prisma.teams.findFirst({
        where: { hackathonId: data.hackathonId, teamMembers: { some: { memberId: data.userId } } },
    });

    if (!team) throw DatabaseErrorType.NotATeamMember;

    return team;
};

export const getTeamIdFromUserIdAndHackathonId = async (data: UserHackathonParams) => {
    const team = await getTeamFromUserIdAndHackathonId(data);

    if (!team) throw DatabaseErrorType.NotATeamMember;

    return team.id;
};
