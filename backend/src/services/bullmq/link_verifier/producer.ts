import { LinkVerifierJob } from "../../../types/project_details.js";
import { linksQueue } from "../queues.js";

export const addLinksToVerify = async (data: LinkVerifierJob[]) => {
    await linksQueue.add("verify-links", data, {
        attempts: 5,
        backoff: {
            type: "exponential",
            delay: 1000,
        },
    });
};
