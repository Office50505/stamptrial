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

  if (/^data:image\//i.test(String(compacted.settings?.selectedVariantPreviewUrl || ""))) {
    const replacement = compacted.chosenVariantUrl || compacted.finalDesignUrl || compacted.originalImageUrl || "";
    if (replacement) {
      compacted.settings = { ...compacted.settings, selectedVariantPreviewUrl: replacement };
    } else {
      compacted.settings = { ...compacted.settings };
      delete compacted.settings.selectedVariantPreviewUrl;
    }
  }

  compacted.migratedFromPreviousDbAt = new Date();
  return compacted;
}

const sourceUri = requiredEnv(["SOURCE_MONGODB_URI", "OLD_MONGODB_URI"]);
const targetUri = requiredEnv("MONGODB_URI");
const clientOptions = {
  serverSelectionTimeoutMS: 10000,
  connectTimeoutMS: 10000,
  socketTimeoutMS: 240000,
  maxPoolSize: 1,
  minPoolSize: 0,
  maxConnecting: 1
};
const sourceClient = new MongoClient(sourceUri, clientOptions);
const targetClient = new MongoClient(targetUri, clientOptions);

async function retryMongoOperation(label, operation, attempts = 4) {
  let lastError;

  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      const retryable = error?.name === "MongoNetworkTimeoutError" ||
        error?.hasErrorLabel?.("RetryableWriteError") ||
        error?.hasErrorLabel?.("TransientTransactionError");

      if (!retryable || attempt === attempts) break;

      const delayMs = 1000 * attempt;
      console.warn(`${label} failed on attempt ${attempt}; retrying in ${delayMs}ms: ${error.message}`);
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }

  throw lastError;
}

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
    console.log(`Reading and writing ${designIdsToWrite.length} design documents to target...`);
    const totals = { matchedCount: 0, modifiedCount: 0, upsertedCount: 0, processedCount: 0, skippedMissingCount: 0 };
    const writeOperation = async (operation) => {
      const result = await retryMongoOperation(
        "Target design write",
        () => targetDesigns.bulkWrite([operation], { ordered: false })
      );
      totals.matchedCount += result.matchedCount;
      totals.modifiedCount += result.modifiedCount;
      totals.upsertedCount += result.upsertedCount;
      totals.processedCount++;
      if (totals.processedCount % 10 === 0 || totals.processedCount === designIdsToWrite.length) {
        console.log(`Wrote ${totals.processedCount}/${designIdsToWrite.length} design documents...`);
      }
    };

    for (const [index, designId] of designIdsToWrite.entries()) {
      if (index % 10 === 0) {
        console.log(`Reading ${index + 1}/${designIdsToWrite.length}: ${designId}`);
      }
      const design = await retryMongoOperation(
        `Source read ${designId}`,
        () => sourceDesigns.findOne({ designId }, { maxTimeMS: 30000 })
      );
      if (!design) {
        totals.skippedMissingCount++;
        console.warn(`Skipped missing source design ${designId}`);
        continue;
      }

      const compactedDesign = compactDesign(design);
      const update = overwriteExisting
        ? { $set: compactedDesign }
        : { $setOnInsert: compactedDesign };

      if (index % 10 === 0) {
        console.log(`Writing ${index + 1}/${designIdsToWrite.length}: ${designId}`);
      }
      await writeOperation({
        updateOne: {
          filter: { designId: compactedDesign.designId },
          update,
          upsert: true
        }
      });
    }
    console.log(JSON.stringify(totals, null, 2));
  }
} finally {
  await Promise.allSettled([sourceClient.close(), targetClient.close()]);
}
