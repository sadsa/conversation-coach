// lib/r2.ts
import { S3Client, DeleteObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { randomUUID } from 'crypto'

function getClient() {
  return new S3Client({
    region: 'auto',
    endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: process.env.R2_ACCESS_KEY_ID!,
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
    },
  })
}

/** Generate a presigned PUT URL and the key to store. Expires in 1 hour. */
export async function presignedUploadUrl(extension: string): Promise<{ key: string; url: string }> {
  const key = `audio/${randomUUID()}.${extension}`
  const client = getClient()
  const command = new PutObjectCommand({
    Bucket: process.env.R2_BUCKET_NAME!,
    Key: key,
  })
  const url = await getSignedUrl(client, command, { expiresIn: 3600 })
  return { key, url }
}

/** Delete an object by key. Does not throw if object does not exist. */
export async function deleteObject(key: string): Promise<void> {
  const client = getClient()
  try {
    await client.send(new DeleteObjectCommand({
      Bucket: process.env.R2_BUCKET_NAME!,
      Key: key,
    }))
  } catch {
    // Best-effort delete — log but don't fail
    console.error(`R2 delete failed for key ${key}`)
  }
}

/** Public URL for a stored object (used to pass to AssemblyAI). */
export function publicUrl(key: string): string {
  return `${process.env.R2_PUBLIC_URL}/${key}`
}
