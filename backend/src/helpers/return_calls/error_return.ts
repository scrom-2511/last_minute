import { Response } from "express";
import { AppErrorType, ErrorTypeUtils } from "./error_types.js";

export const returnError = (errorType: AppErrorType, res: Response) => {
    res.status(ErrorTypeUtils.getStatusCode(errorType)).json({
        success: false,
        message: ErrorTypeUtils.getMessage(errorType),
    })
}