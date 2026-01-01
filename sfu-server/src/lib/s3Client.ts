import { S3Client } from "@aws-sdk/client-s3";

/**
 * Hard fail early if Render did not inject env vars.
 * This is GOOD. It prevents silent AWS failures.
 */
if (
  !process.env.AWS_ACCESS_KEY_ID ||
  !process.env.AWS_SECRET_ACCESS_KEY ||
  !process.env.AWS_REGION
) {
  console.error("AWS_ACCESS_KEY_ID:", !!process.env.AWS_ACCESS_KEY_ID);
  console.error("AWS_SECRET_ACCESS_KEY:", !!process.env.AWS_SECRET_ACCESS_KEY);
  console.error("AWS_REGION:", process.env.AWS_REGION);

  throw new Error("❌ AWS credentials are missing at runtime");
}

export const s3 = new S3Client({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});
