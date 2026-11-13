import { Worker } from "bullmq";
import { LINK_VERIFIER_QUEUE_NAME } from "../queues.js";
import { LinkVerifierJob } from "../../../types/project_details.js";
import { isLinkProper } from "../../../helpers/project_details/links.js";
import { redisConnection } from "../redisClient.js";

const verifyLinks = new Worker(
    LINK_VERIFIER_QUEUE_NAME,
    async (job) => {
        const links: LinkVerifierJob[] = job.data;

        const rawLinks = links.map((link) => link.link);

        const linkProperResults = await Promise.allSettled(rawLinks.map(isLinkProper));

        const faultyIds = linkProperResults.flatMap((result, i) =>
            result.status === "rejected" || !result.value ? [links[i].id] : [],
        );

        // TODO: implement updateFailedLinks
        if (faultyIds.length > 0) await updateFailedLinks(faultyIds);
    },
    { connection: redisConnection, concurrency: 5 },
);
