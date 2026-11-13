import { GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { s3Client } from "./client.js";
import { readFile } from "node:fs/promises";

export const uploadToS3 = async (filePath: string, fileName: string) => {
    const buffer = await readFile(filePath);

    const command = new PutObjectCommand({
        Bucket: process.env.S3_BUCKET!,
        Key: fileName,
        Body: buffer,
    });

    await s3Client.send(command);
};

export const downloadFromS3 = async (fileId: number): Promise<Buffer> => {
    const command = new GetObjectCommand({
        Bucket: process.env.S3_BUCKET!,
        Key: fileId.toString(),
    });

    const response = await s3Client.send(command);

    if (!response.Body) throw new Error(`File not found: ${fileId}`);

    const bytes = await response.Body.transformToByteArray();

    return Buffer.from(bytes);
};
