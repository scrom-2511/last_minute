import { getProjectIdFromUserIdAndHackathonId } from "./project";
import { prisma } from "@/prisma/prisma";
import {
    GetFileVersionFromUserIdAndHackathonIdParams,
    MarkFileUploadedParams,
    SetFileValidationFailedParams,
    UpsertFileAndCreateNewFileVersionParams,
} from "./types";
import { DatabaseErrorType } from "@/helpers/return_calls/error_types";
import { FileStatus } from "@/prisma/generated/prisma/enums";
import { cached, cacheGet, cacheSet, keys, TTL } from "./cache/redisCache";

type LookupPointer = { fileId: number; version: number };

import type { Prisma } from "@/prisma/generated/prisma/client";

type FileVersionRow = Prisma.FileVersionsGetPayload<object>;

const cacheFileVersion = (row: FileVersionRow) =>
    cacheSet(keys.fileVersion(row.fileId, row.version), row);

export const upsertFileAndCreateNewFileVersion = async (
    data: UpsertFileAndCreateNewFileVersionParams,
) => {
    const projectId = await getProjectIdFromUserIdAndHackathonId(data);

    const fileVersion = await prisma.$transaction(async (tx) => {
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

    const pointer: LookupPointer = { fileId: fileVersion.fileId, version: fileVersion.version };

    await Promise.all([
        cacheFileVersion(fileVersion),
        cacheSet(keys.fileVersionLookup(projectId, data.fileHash), pointer),
        cacheSet(keys.fileProject(fileVersion.fileId), projectId),
    ]);

    return fileVersion;
};

export const getFileVersionFromUserIdAndHackathonId = async (
    data: GetFileVersionFromUserIdAndHackathonIdParams,
) => {
    const projectId = await getProjectIdFromUserIdAndHackathonId(data);
    const lookupKey = keys.fileVersionLookup(projectId, data.fileHash);

    const pointer = await cacheGet<LookupPointer>(lookupKey);
    if (pointer) {
        const hit = await cacheGet<FileVersionRow>(
            keys.fileVersion(pointer.fileId, pointer.version),
        );
        if (hit) return hit;
    }

    const fileVersion = await prisma.fileVersions.findFirst({
        where: { file: { projectId }, fileHash: data.fileHash },
        orderBy: { version: "desc" },
    });

    if (!fileVersion) throw DatabaseErrorType.FileVersionNotFound;

    await Promise.all([
        cacheFileVersion(fileVersion),
        cacheSet(lookupKey, { fileId: fileVersion.fileId, version: fileVersion.version }),
    ]);

    return fileVersion;
};

export const markFileUploaded = async (data: MarkFileUploadedParams) => {
    const fileVersion = await prisma.fileVersions.update({
        where: { fileIdVersion: { fileId: data.fileId, version: data.fileVersion } },
        data: { status: FileStatus.completed },
    });

    await cacheFileVersion(fileVersion);

    return fileVersion;
};

export const setFileValidationFailed = async (data: SetFileValidationFailedParams) => {
    const { fileId, fileVersion, reason } = data;

    const updated = await prisma.fileVersions.update({
        where: { fileIdVersion: { fileId, version: fileVersion } },
        data: { status: "needsFix", rejectReason: reason },
    });

    await cacheFileVersion(updated);

    return updated;
};

interface GetUploadInitiateTime {
    fileId: number;
    fileVersion: number;
}

export const getUploadInitiateTime = async (data: GetUploadInitiateTime) => {
    const { fileId, fileVersion } = data;

    const row = await cached<FileVersionRow>(
        keys.fileVersion(fileId, fileVersion),
        TTL.long,
        async () => {
            const found = await prisma.fileVersions.findUnique({
                where: { fileIdVersion: { fileId, version: fileVersion } },
            });

            if (!found) throw DatabaseErrorType.FileNotFound;

            return found;
        },
    );

    return row.createdAt;
};
