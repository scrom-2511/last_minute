import { Request, Response } from "express";
import { z } from "zod";
import { returnError } from "../../../helpers/return_calls/error_return.js";
import { ErrorType } from "../../../helpers/return_calls/error_types.js";
import { statusEmitter } from "../../../services/events/status_emitter.js";

const querySchema = z.object({
    projectId: z.coerce.number().int().positive(),
});

// Server-Sent Events (SSE) endpoint providing live status updates without page reload
export const streamLiveStatus = async (req: Request, res: Response) => {
    const parsed = querySchema.safeParse(req.query);
    if (!parsed.success) return returnError(ErrorType.InvalidRequest, res);

    const { projectId } = parsed.data;

    // TODO: Verify project belongs to authenticated team in database
    const initialStatus = await getProjectSubmissionStatus();
    if (!initialStatus) return returnError(ErrorType.ResourceNotFound, res);

    // Initialize SSE streaming headers
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.status(200);

    // Send initial status immediately upon connection
    res.write(`data: ${JSON.stringify(initialStatus)}\n\n`);

    // Stream subsequent status transitions triggered by background workers or updates
    const channel = `project:${projectId}`;
    const onStatusUpdate = (update: unknown) => {
        res.write(`data: ${JSON.stringify(update)}\n\n`);
    };

    statusEmitter.on(channel, onStatusUpdate);

    // Clean up event listener when client closes connection to avoid memory leak
    req.on("close", () => {
        statusEmitter.off(channel, onStatusUpdate);
    });
};
