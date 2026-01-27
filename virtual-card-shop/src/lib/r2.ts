import { S3Client } from "@aws-sdk/client-s3";

let _client: S3Client | null = null;

function req(name: string) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env var: ${name}`);
  return v.trim();
}

export function getR2Client() {
  if (_client) return _client;

  _client = new S3Client({
    region: "auto",
    endpoint: `https://${req("R2_ACCOUNT_ID")}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: req("R2_ACCESS_KEY_ID"),
      secretAccessKey: req("R2_SECRET_ACCESS_KEY"),
    },
  });

  return _client;
}
