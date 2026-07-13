import "dotenv/config";
import { MongoClient } from "mongodb";

const DESIGN_IMAGE_FIELDS = ["originalImageUrl", "chosenVariantUrl", "finalDesignUrl"];
const applyChanges = process.argv.includes("--apply");
const cdnBaseUrl = (process.env.BUNNY_CDN_BASE_URL || "https://stamptrial.b-cdn.net").replace(/\/$/, "");
const dbName = process.env.MONGODB_DB_NAME || "stamptrial";

function requiredEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing ${name}`);
  }
  return value;
}

function compactDesignUrl(value, designId) {
  const url = typeof value === "string" ? value.trim() : "";
  if (!url || !designId) return "";

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

function buildUpdateForDesign(design) {
  const $set = {};

  for (const field of DESIGN_IMAGE_FIELDS) {
    const currentValue = design[field];
    const compactValue = compactDesignUrl(currentValue, design.designId);
    if (compactValue && compactValue !== currentValue) {
      $set[field] = compactValue;
    }
  }

  if (!Object.keys($set).length) return null;
  $set.updatedAt = new Date();
  return { $set };
}

const client = new MongoClient(requiredEnv("MONGODB_URI"));

try {
  await client.connect();
  const designs = client.db(dbName).collection("designs");
  const cursor = designs.find(
    {
      $or: DESIGN_IMAGE_FIELDS.map((field) => ({
        [field]: { $regex: `^${cdnBaseUrl.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}/designs/` }
      }))
    },
    {
      projection: {
        designId: 1,
        originalImageUrl: 1,
        chosenVariantUrl: 1,
        finalDesignUrl: 1
      }
    }
  );

  const operations = [];
  for await (const design of cursor) {
    const update = buildUpdateForDesign(design);
    if (!update) continue;
    operations.push({
      updateOne: {
        filter: { _id: design._id },
        update
      }
    });
  }

  console.log(JSON.stringify({
    mode: applyChanges ? "apply" : "dry-run",
    dbName,
    collection: "designs",
    cdnBaseUrl,
    documentsToUpdate: operations.length
  }, null, 2));

  if (applyChanges && operations.length) {
    const result = await designs.bulkWrite(operations, { ordered: false });
    console.log(JSON.stringify({
      matchedCount: result.matchedCount,
      modifiedCount: result.modifiedCount
    }, null, 2));
  }
} finally {
  await client.close();
}
