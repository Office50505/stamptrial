import "dotenv/config";
import { MongoClient } from "mongodb";

const applyChanges = process.argv.includes("--apply");
const dbName = process.env.MONGODB_DB_NAME || "stamptrial";

function requiredEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing ${name}`);
  return value;
}

function formatBytes(bytes) {
  if (bytes < 1024) return `${Math.round(bytes)} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

const client = new MongoClient(requiredEnv("MONGODB_URI"), {
  serverSelectionTimeoutMS: 10000,
  connectTimeoutMS: 10000,
  socketTimeoutMS: 60000
});

try {
  await client.connect();
  const designs = client.db(dbName).collection("designs");
  const matchEmbeddedPreview = {
    "settings.selectedVariantPreviewUrl": { $regex: "^data:image/" }
  };
  const [summary] = await designs.aggregate([
    { $match: matchEmbeddedPreview },
    {
      $project: {
        previewBytes: { $strLenBytes: "$settings.selectedVariantPreviewUrl" },
        replacement: {
          $ifNull: [
            "$chosenVariantUrl",
            { $ifNull: ["$finalDesignUrl", { $ifNull: ["$originalImageUrl", ""] }] }
          ]
        }
      }
    },
    {
      $group: {
        _id: null,
        embeddedPreviews: { $sum: 1 },
        embeddedPreviewBytes: { $sum: "$previewBytes" },
        withReplacement: {
          $sum: {
            $cond: [{ $gt: [{ $strLenBytes: "$replacement" }, 0] }, 1, 0]
          }
        },
        withoutReplacement: {
          $sum: {
            $cond: [{ $gt: [{ $strLenBytes: "$replacement" }, 0] }, 0, 1]
          }
        }
      }
    }
  ], { maxTimeMS: 30000 }).toArray();

  console.log(JSON.stringify({
    mode: applyChanges ? "apply" : "dry-run",
    dbName,
    collection: "designs",
    embeddedPreviews: summary?.embeddedPreviews || 0,
    withReplacement: summary?.withReplacement || 0,
    withoutReplacement: summary?.withoutReplacement || 0,
    embeddedPreviewBytes: formatBytes(summary?.embeddedPreviewBytes || 0)
  }, null, 2));

  if (applyChanges && summary?.embeddedPreviews) {
    const result = await designs.updateMany(
      matchEmbeddedPreview,
      [
        {
          $set: {
            "settings.selectedVariantPreviewUrl": {
              $let: {
                vars: {
                  replacement: {
                    $ifNull: [
                      "$chosenVariantUrl",
                      { $ifNull: ["$finalDesignUrl", { $ifNull: ["$originalImageUrl", ""] }] }
                    ]
                  }
                },
                in: {
                  $cond: [
                    { $gt: [{ $strLenBytes: "$$replacement" }, 0] },
                    "$$replacement",
                    "$$REMOVE"
                  ]
                }
              }
            },
            updatedAt: "$$NOW"
          }
        }
      ]
    );

    console.log(JSON.stringify({
      matchedCount: result.matchedCount,
      modifiedCount: result.modifiedCount
    }, null, 2));
  }
} finally {
  await client.close().catch(() => {});
}
