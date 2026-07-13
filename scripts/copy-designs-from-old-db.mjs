import "dotenv/config";
import { MongoClient } from "mongodb";

const DESIGN_IMAGE_FIELDS = ["originalImageUrl", "chosenVariantUrl", "finalDesignUrl"];
const applyChanges = process.argv.includes("--apply");
const overwriteExisting = process.argv.includes("--overwrite");
const cdnBaseUrl = (process.env.BUNNY_CDN_BASE_URL || "https://stamptrial.b-cdn.net").replace(/\/$/, "");
const sourceDbName = process.env.SOURCE_MONGODB_DB_NAME || process.env.OLD_MONGODB_DB_NAME || "stamptrial";
const targetDbName = process.env.TARGET_MONGODB_DB_NAME || process.env.MONGODB_DB_NAME || "stamptrial";

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

const sourceUri = requiredEnv(["SOURCE_MONGODB_URI", "OLD_MONGODB_URI"]);
const targetUri = requiredEnv("MONGODB_URI");
const clientOptions = {
  serverSelectionTimeoutMS: 10000,
  connectTimeoutMS: 10000,
  socketTimeoutMS: 120000
};
const sourceClient = new MongoClient(sourceUri, clientOptions);
const targetClient = new MongoClient(targetUri, clientOptions);

try {
  console.log("Connecting to source and target MongoDB clusters...");
  await Promise.all([sourceClient.connect(), targetClient.connect()]);
  console.log("Connected. Reading source designs...");

  const sourceDesigns = sourceClient.db(sourceDbName).collection("designs");
  const targetDesigns = targetClient.db(targetDbName).collection("designs");
  const sourceDocumentCount = await sourceDesigns.estimatedDocumentCount({ maxTimeMS: 15000 });
  const sourceDesignIdDocs = await sourceDesigns
    .find({}, { projection: { designId: 1 }, maxTimeMS: 30000 })
    .batchSize(50)
    .toArray();
  console.log(`Read ${sourceDesignIdDocs.length} source design IDs. Checking target for duplicates...`);

  const validSourceDesignIds = sourceDesignIdDocs
    .map((design) => design.designId)
    .filter(Boolean);
  const skippedWithoutDesignId = sourceDesignIdDocs.length - validSourceDesignIds.length;
  const existingTargetDesignIds = new Set(
    await targetDesigns.distinct("designId", { designId: { $in: validSourceDesignIds } }, { maxTimeMS: 30000 })
  );
  console.log(`Found ${existingTargetDesignIds.size} matching design IDs already in target.`);

  const designIdsToWrite = validSourceDesignIds.filter((designId) =>
    overwriteExisting || !existingTargetDesignIds.has(designId)
  );

  console.log(JSON.stringify({
    mode: applyChanges ? "apply" : "dry-run",
    overwriteExisting,
    cdnBaseUrl,
    sourceDbName,
    targetDbName,
    sourceDocuments: sourceDocumentCount,
    skippedWithoutDesignId,
    alreadyInTarget: existingTargetDesignIds.size,
    documentsToWrite: designIdsToWrite.length
  }, null, 2));

  if (applyChanges && designIdsToWrite.length) {
    console.log(`Streaming and writing ${designIdsToWrite.length} design documents to target...`);
    const totals = { matchedCount: 0, modifiedCount: 0, upsertedCount: 0, processedCount: 0 };
    const flushOperations = async (operations) => {
      if (!operations.length) return;
      const result = await targetDesigns.bulkWrite(operations, { ordered: false });
      totals.matchedCount += result.matchedCount;
      totals.modifiedCount += result.modifiedCount;
      totals.upsertedCount += result.upsertedCount;
      totals.processedCount += operations.length;
      console.log(`Wrote ${totals.processedCount}/${designIdsToWrite.length} design documents...`);
    };

    let operations = [];
    const cursor = sourceDesigns
      .find({ designId: { $in: designIdsToWrite } }, { maxTimeMS: 120000 })
      .batchSize(10);

    for await (const design of cursor) {
      const compactedDesign = compactDesign(design);
      const update = overwriteExisting
        ? { $set: compactedDesign }
        : { $setOnInsert: compactedDesign };

      operations.push({
        updateOne: {
          filter: { designId: compactedDesign.designId },
          update,
          upsert: true
        }
      });

      if (operations.length >= 20) {
        await flushOperations(operations);
        operations = [];
      }
    }

    await flushOperations(operations);
    console.log(JSON.stringify(totals, null, 2));
  }
} finally {
  await Promise.allSettled([sourceClient.close(), targetClient.close()]);
}
