const AWS = require('aws-sdk');

const VALID_CATEGORIES = new Set(['parts', 'notes', 'quotes']);

const s3 = new AWS.S3({
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  region: process.env.AWS_REGION,
});

function getBucket() {
  const bucket = process.env.AWS_S3_BUCKET;
  if (!bucket) throw new Error('AWS_S3_BUCKET environment variable is not set');
  return bucket;
}

function sanitizeFilename(filename) {
  return filename.replace(/[^a-zA-Z0-9._-]/g, '_');
}

function buildKey(companyCode, category, entityId, filename) {
  if (!companyCode) throw new Error('companyCode is required');
  if (!VALID_CATEGORIES.has(category)) {
    throw new Error(`Invalid category "${category}". Must be one of: ${[...VALID_CATEGORIES].join(', ')}`);
  }
  if (!entityId) throw new Error('entityId is required');
  if (!filename) throw new Error('filename is required');

  const safeFilename = sanitizeFilename(filename);
  return `companies/${companyCode}/${category}/${entityId}/${safeFilename}`;
}

async function uploadFile({ companyCode, category, entityId, filename, buffer, mimetype }) {
  const key = buildKey(companyCode, category, entityId, filename);
  const bucket = getBucket();

  const params = {
    Bucket: bucket,
    Key: key,
    Body: buffer,
    ContentType: mimetype,
  };

  await s3.upload(params).promise();

  const url = `https://${bucket}.s3.${process.env.AWS_REGION}.amazonaws.com/${key}`;
  return { s3Key: key, url };
}

async function downloadFile(s3Key) {
  if (!s3Key) throw new Error('s3Key is required');

  const params = {
    Bucket: getBucket(),
    Key: s3Key,
  };

  return s3.getObject(params).createReadStream();
}

async function deleteFile(s3Key) {
  if (!s3Key) throw new Error('s3Key is required');

  const params = {
    Bucket: getBucket(),
    Key: s3Key,
  };

  await s3.deleteObject(params).promise();
}

async function getSignedUrl(s3Key, expiresIn = 3600) {
  if (!s3Key) throw new Error('s3Key is required');

  const params = {
    Bucket: getBucket(),
    Key: s3Key,
    Expires: expiresIn,
  };

  return s3.getSignedUrlPromise('getObject', params);
}

module.exports = { uploadFile, downloadFile, deleteFile, getSignedUrl };
