import { PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner"
import { BUCKET, s3 } from "./client.js";

export const getPresignedUploadUrl = async (fileId: string) => {
    const command = new PutObjectCommand({
        Bucket: BUCKET,
        Key: fileId,
    });

    const url = await getSignedUrl(s3, command, { expiresIn: 60 * 60 * 24 });

    return url;
}