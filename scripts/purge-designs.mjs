import "dotenv/config";
import { MongoClient } from "mongodb";

function requiredEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing ${name}`);
  return value;
}
function argument(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : "";
}
function inclusiveIndiaCutoff(through) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(through)) throw new Error("Use --through YYYY-MM-DD");
  const [year, month, day] = through.split("-").map(Number);
  const nextDay = new Date(Date.UTC(year, month - 1, day + 1));
  const nextDate = [nextDay.getUTCFullYear(), String(nextDay.getUTCMonth() + 1).padStart(2, "0"), String(nextDay.getUTCDate()).padStart(2, "0")].join("-");
  return new Date(`${nextDate}T00:00:00+05:30`);
}
function bunnyStoragePath(imageUrl) {
  const cdnBase = new URL(requiredEnv("BUNNY_CDN_BASE_URL"));
  const candidate = new URL(imageUrl);
  if (candidate.origin !== cdnBase.origin) throw new Error(`Refusing URL outside Bunny CDN: ${candidate.origin}`);
  const basePath = cdnBase.pathname.replace(/^\/+|\/+$/g, "");
  const candidatePath = candidate.pathname.replace(/^\/+/, "");
  if (basePath && !candidatePath.startsWith(`${basePath}/`)) throw new Error("Refusing URL outside configured Bunny CDN path");
  return basePath ? candidatePath.slice(basePath.length + 1) : candidatePath;
}
async function deleteBunnyFile(imageUrl) {
  const endpoint = (process.env.BUNNY_STORAGE_ENDPOINT || "https://storage.bunnycdn.com").replace(/\/$/, "");
  const response = await fetch(`${endpoint}/${requiredEnv("BUNNY_STORAGE_ZONE")}/${bunnyStoragePath(imageUrl)}`, {
    method: "DELETE", headers: { AccessKey: requiredEnv("BUNNY_STORAGE_PASSWORD") }
  });
  if (!response.ok && response.status !== 404) {
    const body = await response.text().catch(() => "");
    throw new Error(`Bunny delete failed (${response.status}): ${body || response.statusText}`);
  }
}
const through = argument("--through");
const confirmed = process.argv.includes("--confirm");
const cutoff = inclusiveIndiaCutoff(through);
const client = new MongoClient(requiredEnv("MONGODB_URI"));
try {
  await client.connect();
  const designs = client.db(process.env.MONGODB_DB_NAME || "stamptrial").collection("designs");
  const matches = await designs.find(
    { createdAt: { $lt: cutoff } },
    { projection: { designId: 1, createdAt: 1, originalImageUrl: 1, chosenVariantUrl: 1, finalDesignUrl: 1 } }
  ).sort({ createdAt: 1 }).toArray();
  console.log(`Matched ${matches.length} design(s) created through ${through} in India time.`);
  matches.forEach((d) => console.log(`${d.createdAt?.toISOString() || "no-date"}  ${d.designId || d._id}`));
  if (!confirmed) {
    console.log("Dry run only. Add --confirm to permanently delete these Bunny files and MongoDB records.");
    process.exitCode = 2;
  } else {
    let deleted = 0, failed = 0;
    for (const design of matches) {
      try {
        const urls = [...new Set([design.originalImageUrl, design.chosenVariantUrl, design.finalDesignUrl].filter(Boolean))];
        for (const url of urls) await deleteBunnyFile(url);
        await designs.deleteOne({ _id: design._id });
        deleted++;
        console.log(`Deleted ${design.designId || design._id}`);
      } catch (error) {
        failed++;
        console.error(`Skipped ${design.designId || design._id}: ${error.message}`);
      }
    }
    console.log(`Finished. Deleted: ${deleted}. Failed/skipped: ${failed}.`);
    if (failed) process.exitCode = 1;
  }
} finally {
  await client.close();
}