import { PutObjectCommand, UploadPartCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { BUCKET, s3Client } from "./client.js";

export const generatePresignedUploadUrl = async (fileId: string) => {
    const command = new PutObjectCommand({
        Bucket: BUCKET,
        Key: fileId,
    });

    const url = await getSignedUrl(s3Client, command, {
        expiresIn: 60 * 60 * 24,
    });

    return url;
};

export const generateMultipartPresignedUploadUrl = async (
    key: string,
    uploadId: string,
    partNumber: number,
    contentLength: number,
) => {
    const command = new UploadPartCommand({
        Bucket: BUCKET,
        Key: key,
        UploadId: uploadId,
        PartNumber: partNumber,
        ContentLength: contentLength,
    });

    const url = await getSignedUrl(s3Client, command, {
        expiresIn: 60 * 60,
        signableHeaders: new Set(["content-length"]),
    });

    return url;
};
