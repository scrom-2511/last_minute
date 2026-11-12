import { getHackathonDeadline } from "../../database/hackathon.js";

export const checkHackathonDeadlineExceeded = async (hackathonId: string): Promise<boolean> => {
    const deadline = await getHackathonDeadline(hackathonId);
    const now = Math.floor(Date.now() / 1000);

    return now > deadline;
}
