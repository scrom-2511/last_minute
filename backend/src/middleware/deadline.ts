import { Request, Response, NextFunction } from "express";
import { checkHackathonDeadlineExceeded } from "../helpers/hackathons/manager.js";
import { returnError } from "../helpers/return_calls/error_return.js";
import { BusinessErrorType, ErrorType } from "../helpers/return_calls/error_types.js";

// Enforces hackathon deadline on server clock; rejects requests submitted after deadline passes
export const deadlineMiddleware = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const hackathonId =
            req.body?.hackathonId?.toString() ||
            (req.query?.hackathonId as string) ||
            req.params?.hackathonId ||
            req.hackathonId;

        if (!hackathonId) return returnError(ErrorType.InvalidRequest, res);

        // Reject new submissions and edits if server deadline has passed
        const exceeded = await checkHackathonDeadlineExceeded(hackathonId);
        if (exceeded) return returnError(BusinessErrorType.HackathonDeadlineExceeded, res);

        next();
    } catch (error) {
        console.error(error);
        return returnError(ErrorType.InternalServerError, res);
    }
};
