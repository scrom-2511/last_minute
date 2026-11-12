import { Response } from "express";
import { SuccessStatusCodes } from "./status_codes.js";

export const returnSuccess = (data: any, status_code: SuccessStatusCodes, res: Response) => {
    res.status(status_code).json({
        success: true,
        data: data
    })
}