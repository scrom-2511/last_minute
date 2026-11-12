import { Request, Response, Router } from "express";
import { uploadProjectDetails } from "../controllers/project_details/post/project_details.js";

const router = Router();

router.post("/project-details", async (req: Request, res: Response) => {
    return await uploadProjectDetails(req, res);
})