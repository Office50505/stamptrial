import "dotenv/config";
import { BSON, MongoClient } from "mongodb";

const DESIGN_IMAGE_FIELDS = ["originalImageUrl", "chosenVariantUrl", "finalDesignUrl"];
const cdnBaseUrl = (process.env.BUNNY_CDN_BASE_URL || "https://stamptrial.b-cdn.net").replace(/\/$/, "");
const sourceDbName = process.env.SOURCE_MONGODB_DB_NAME || process.env.OLD_MONGODB_DB_NAME || "stamptrial";

function requiredEnv(names) {
  const envNames = Array.isArray(names) ? names : [names];
  for (const name of envNames) {
    const value = process.env[name];
    if (value) return value;
  }
  throw new Error(`Missing ${envNames.join(" or ")}`);
}

function compactDesignUrl(value, designId) {
  const url = typeof value === "string" ? value.trim() : "";
  if (!url || !designId) return url;

  const designPrefix = `designs/${designId}/`;
  const fullPrefix = `${cdnBaseUrl}/${designPrefix}`;

  if (url.startsWith(fullPrefix)) {
    return url.slice(fullPrefix.length);
  }

  if (url.startsWith(designPrefix)) {
    return url.slice(designPrefix.length);
  }

  return url;
}

function compactDesign(design) {
  const compacted = { ...design };
  delete compacted._id;

  for (const field of DESIGN_IMAGE_FIELDS) {
    compacted[field] = compactDesignUrl(compacted[field], compacted.designId);
  }

  compacted.migratedFromPreviousDbAt = new Date();
  return compacted;
}

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

const sourceClient = new MongoClient(requiredEnv(["SOURCE_MONGODB_URI", "OLD_MONGODB_URI"]));

try {
  await sourceClient.connect();
  const sourceDesigns = sourceClient.db(sourceDbName).collection("designs");
  const sourceDocs = await sourceDesigns.find({}).toArray();
  const validSourceDocs = sourceDocs.filter((design) => design.designId);

  let originalBytes = 0;
  let compactedBytes = 0;
  let fullUrlFieldBytes = 0;
  let compactedFieldBytes = 0;

  for (const design of validSourceDocs) {
    const compacted = compactDesign(design);
    originalBytes += BSON.calculateObjectSize(design);
    compactedBytes += BSON.calculateObjectSize(compacted);

    for (const field of DESIGN_IMAGE_FIELDS) {
      fullUrlFieldBytes += Buffer.byteLength(String(design[field] || ""), "utf8");
      compactedFieldBytes += Buffer.byteLength(String(compacted[field] || ""), "utf8");
    }
  }

  const savedBytes = Math.max(0, originalBytes - compactedBytes);
  const savedFieldBytes = Math.max(0, fullUrlFieldBytes - compactedFieldBytes);

  console.log(JSON.stringify({
    sourceDbName,
    collection: "designs",
    cdnBaseUrl,
    sourceDocuments: sourceDocs.length,
    documentsWithDesignId: validSourceDocs.length,
    estimatedOriginalBson: formatBytes(originalBytes),
    estimatedCompactedBsonToImport: formatBytes(compactedBytes),
    estimatedBsonSaved: formatBytes(savedBytes),
    imageFieldTextBefore: formatBytes(fullUrlFieldBytes),
    imageFieldTextAfter: formatBytes(compactedFieldBytes),
    imageFieldTextSaved: formatBytes(savedFieldBytes),
    reductionPercent: originalBytes ? Number(((savedBytes / originalBytes) * 100).toFixed(2)) : 0,
    imageFieldReductionPercent: fullUrlFieldBytes ? Number(((savedFieldBytes / fullUrlFieldBytes) * 100).toFixed(2)) : 0
  }, null, 2));
} finally {
  await sourceClient.close();
}
