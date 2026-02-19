/**
 * Cloud Storage client — file upload and signed URL generation.
 */

import { Storage } from "@google-cloud/storage";

const storage = new Storage();

export async function uploadFile(
  bucketName: string,
  fileName: string,
  data: Buffer,
  contentType: string
): Promise<void> {
  if (!bucketName) {
    console.log(`[DEV] Would upload ${fileName} (${data.length} bytes)`);
    return;
  }

  const bucket = storage.bucket(bucketName);
  const file = bucket.file(fileName);

  await file.save(data, { contentType, resumable: false });
}

export async function getSignedUrl(
  bucketName: string,
  fileName: string,
  expiresInMinutes = 60
): Promise<string> {
  if (!bucketName) return `https://storage.googleapis.com/dev/${fileName}`;

  const [url] = await storage
    .bucket(bucketName)
    .file(fileName)
    .getSignedUrl({
      action: "read",
      expires: Date.now() + expiresInMinutes * 60 * 1000,
    });

  return url;
}

export async function downloadFile(
  bucketName: string,
  fileName: string
): Promise<Buffer> {
  const [data] = await storage.bucket(bucketName).file(fileName).download();
  return data;
}

export async function deleteFile(
  bucketName: string,
  fileName: string
): Promise<void> {
  await storage.bucket(bucketName).file(fileName).delete({ ignoreNotFound: true });
}
