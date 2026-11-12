import { Response } from "express";
import { ErrorType, ErrorTypeUtils } from "./error_types.js";

export const returnError = (error_type: ErrorType, res: Response) => {
    res.status(ErrorTypeUtils.getStatusCode(error_type)).json({
        success: false,
        message: ErrorTypeUtils.getMessage(error_type),
    })
}