import { Response } from "express";
import { ErrorType, ErrorTypeUtils } from "./error_types.js";

export const returnError = (errorType: ErrorType, res: Response) => {
    res.status(ErrorTypeUtils.getStatusCode(errorType)).json({
        success: false,
        message: ErrorTypeUtils.getMessage(errorType),
    })
}