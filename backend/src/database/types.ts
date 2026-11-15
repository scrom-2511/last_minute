import { Extension, SubmissionStatus } from "@/prisma/generated/prisma/enums";

export interface UserHackathonParams {
    userId: number;
    hackathonId: number;
}

export interface ProjectLinksParams {
    link: string;
    name: string;
}

export interface CreateProjectParams extends UserHackathonParams {
    title?: string;
    description?: string;
    links?: ProjectLinksParams[];
}

export interface UpdateProjectSubmissionStatus extends UserHackathonParams {
    fileId?: number;
    projectId?: number;
    status: SubmissionStatus;
}

export interface GetProjectSubmissionStatusParams extends UserHackathonParams {
    projectId: number;
}

export interface UpsertFileAndCreateNewFileVersionParams extends UserHackathonParams {
    name: string;
    mimeType: string;
    size: number;
    fileHash: string;
    uploadId: string;
    extension: Extension;
}

export interface GetFileVersionFromUserIdAndHackathonIdParams extends UserHackathonParams {
    fileHash: string;
}

export interface MarkFileUploadedParams extends UserHackathonParams {
    fileVersionId: number;
}
