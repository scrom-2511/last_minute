import { Response } from "express";
import { SuccessStatusCodes } from "./status_codes.js";

export const returnSuccess = (data: any, statusCode: SuccessStatusCodes, res: Response) => {
    res.status(statusCode).json({
        success: true,
        data: data
    })
}