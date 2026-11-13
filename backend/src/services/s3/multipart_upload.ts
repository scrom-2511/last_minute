import {
    CompletedPart,
    CompleteMultipartUploadCommand,
    CreateMultipartUploadCommand,
    ListPartsCommand,
} from "@aws-sdk/client-s3";
import { BUCKET, s3Client } from "./client.js";

export const initiateMultipartUpload = async (key: string) => {
    const command = new CreateMultipartUploadCommand({
        Bucket: BUCKET,
        Key: key,
    });

    const result = await s3Client.send(command);

    return result.UploadId;
};

export const completeMultipartUpload = async (
    key: string,
    uploadId: string,
    parts: CompletedPart[],
) => {
    const command = new CompleteMultipartUploadCommand({
        Bucket: BUCKET,
        Key: key,
        UploadId: uploadId,
        MultipartUpload: {
            Parts: parts,
        },
    });

    return await s3Client.send(command);
};

export const listParts = async (key: string, uploadId: string) => {
    const command = new ListPartsCommand({
        Bucket: BUCKET,
        Key: key,
        UploadId: uploadId,
    });

    return await s3Client.send(command);
};
