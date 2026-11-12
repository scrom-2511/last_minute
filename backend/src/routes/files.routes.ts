import { Request, Response, Router } from "express";
import { uploadFile } from "../controllers/files/post/upload_file.js";
import { uploadEdit } from "../controllers/files/post/upload_edit.js";
import { resumeUpload } from "../controllers/files/post/resume_upload.js";

const router = Router();

router.post("/upload", async (req: Request, res: Response) => {
    return await uploadFile(req, res);
});

router.post("/resume-upload", async (req: Request, res: Response) => {
    return await resumeUpload(req, res);
});

router.post("/edit", async (req: Request, res: Response) => {
    return await uploadEdit(req, res);
});