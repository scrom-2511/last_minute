import { Request, Response } from "express";
import { z } from "zod";
import { returnError } from "../../../helpers/return_calls/error_return.js";
import { ErrorType } from "../../../helpers/return_calls/error_types.js";
import { getOrganizerStats } from "@/database/organizer.js";
import { statusEmitter } from "@/services/events/status_emitter.js";

const querySchema = z.object({
    hackathonId: z.string().min(1),
});

export const getOrganizerDashboardStats = async (req: Request, res: Response) => {
    try {
        const parsed = querySchema.safeParse(req.query);
        if (!parsed.success) return returnError(ErrorType.InvalidRequest, res);

        const stats = await getOrganizerStats({ userId: req.userId, hackathonId: req.hackathonId });

        // Initialize SSE streaming headers
        res.setHeader("Content-Type", "text/event-stream");
        res.setHeader("Cache-Control", "no-cache");
        res.setHeader("Connection", "keep-alive");
        res.status(200);

        // Send initial status immediately upon connection
        res.write(`data: ${JSON.stringify(stats)}\n\n`);

        // Stream subsequent status transitions triggered by background workers or updates
        const channel = `organizer:${req.userId}`;
        const onStatusUpdate = (update: unknown) => {
            res.write(`data: ${JSON.stringify(update)}\n\n`);
        };

        statusEmitter.on(channel, onStatusUpdate);

        req.on("close", () => {
            statusEmitter.off(channel, onStatusUpdate);
        });
    } catch (error) {
        console.error(error);
        return returnError(ErrorType.InternalServerError, res);
    }
};
