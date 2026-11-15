import { DatabaseErrorType } from "@/helpers/return_calls/error_types";
import { prisma } from "@/prisma/prisma";
import { cached, keys, TTL } from "./cache/redisCache";

export const getHackathonDeadline = (hackathonId: number) =>
    cached<Date>(keys.hackathonDeadline(hackathonId), TTL.long, async () => {
        const hackathon = await prisma.hackathons.findFirst({ where: { id: hackathonId } });

        if (!hackathon) throw DatabaseErrorType.HackathonNotFound;

        return hackathon.endTime;
    });
