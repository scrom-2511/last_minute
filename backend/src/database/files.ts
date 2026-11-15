import { getProjectIdFromUserIdAndHackathonId } from "./project";
import { prisma } from "../prisma/prisma";
import {
    GetFileVersionFromUserIdAndHackathonIdParams,
    MarkFileUploadedParams,
    UpsertFileAndCreateNewFileVersionParams,
} from "./types";
import { DatabaseErrorType } from "@/helpers/return_calls/error_types";
import { FileStatus } from "@/prisma/generated/prisma/enums";

export const upsertFileAndCreateNewFileVersion = async (
    data: UpsertFileAndCreateNewFileVersionParams,
) => {
    const projectId = await getProjectIdFromUserIdAndHackathonId(data);

    return prisma.$transaction(async (tx) => {
        const file = await tx.files.upsert({
            where: { projectId },
            create: { projectId, currentVersion: 1 },
            update: { currentVersion: { increment: 1 } },
        });

        return tx.fileVersions.create({
            data: {
                fileId: file.id,
                version: file.currentVersion,
                name: data.name,
                extension: data.extension === "pdf" ? "pdf" : "zip",
                size: data.size,
                fileHash: data.fileHash,
                uploadId: data.uploadId,
                s3Key: `${file.id}/${file.currentVersion}`,
            },
        });
    });
};

export const getFileVersionFromUserIdAndHackathonId = async (
    data: GetFileVersionFromUserIdAndHackathonIdParams,
) => {
    const projectId = await getProjectIdFromUserIdAndHackathonId(data);

    const fileVersion = await prisma.fileVersions.findFirst({
        where: { file: { projectId }, fileHash: data.fileHash },
        orderBy: { version: "desc" },
    });

    if (!fileVersion) throw DatabaseErrorType.FileVersionNotFound;

    return fileVersion;
};

export const markFileUploaded = async (data: MarkFileUploadedParams) => {
    return await prisma.fileVersions.update({
        where: { id: data.fileVersionId },
        data: { status: FileStatus.completed },
    });
};

export interface SetFileValidationFailedParams {
    fileId: number;
    reason: string;
}

export const setFileValidationFailed = async (data: SetFileValidationFailedParams) => {
    const { fileId, reason } = data;

    return await prisma.fileVersions.update({
        where: { id: fileId },
        data: { status: "needsFix", rejectReason: reason },
    });
};
