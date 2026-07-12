import "dotenv/config";
import express from "express";
import cors from "cors";
import { MongoClient } from "mongodb";
import crypto from "node:crypto";

const app = express();
const port = Number(process.env.PORT || 3000);
const GENERATION_CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const GENERATION_CACHE_VERSION = "line-art-gpt-image-2-low-png-2048-v2";

const allowedOrigins = (process.env.ALLOWED_ORIGINS || "")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

function isAllowedOrigin(origin) {
  if (!origin) return true;
  if (allowedOrigins.includes(origin)) return true;

  try {
    const { hostname, protocol } = new URL(origin);
    return protocol === "https:" && (
      hostname.endsWith(".myshopify.com") ||
      hostname === "stampmybrand.com" ||
      hostname.endsWith(".stampmybrand.com")
    );
  } catch {
    return false;
  }
}

function applyCorsHeaders(req, res) {
  const origin = req.headers.origin;
  if (!isAllowedOrigin(origin)) return false;

  if (origin) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
  }

  res.setHeader("Access-Control-Allow-Methods", "GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS");
  res.setHeader(
    "Access-Control-Allow-Headers",
    req.headers["access-control-request-headers"] || "Content-Type, Authorization"
  );
  return true;
}

app.use((req, res, next) => {
  applyCorsHeaders(req, res);
  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }
  next();
});

app.use(cors({
  origin(origin, callback) {
    if (isAllowedOrigin(origin)) {
      callback(null, true);
      return;
    }
    callback(new Error("Origin not allowed"));
  }
}));

let mongoClientPromise;
let designIndexesPromise;
let designIndexesReady = false;
let designOrderPriorityPromise;
let dashboardMetricsCache = null;
const dashboardEventClients = new Set();

function broadcastDashboardEvent(type, payload = {}) {
  const message = `event: dashboard-update\ndata: ${JSON.stringify({ type, ...payload, at: new Date().toISOString() })}\n\n`;
  for (const client of dashboardEventClients) {
    try {
      client.write(message);
    } catch {
      dashboardEventClients.delete(client);
    }
  }
}

const dashboardEventHeartbeat = setInterval(() => {
  for (const client of dashboardEventClients) {
    try {
      client.write(": heartbeat\n\n");
    } catch {
      dashboardEventClients.delete(client);
    }
  }
}, 25_000);
dashboardEventHeartbeat.unref?.();

function requiredEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing ${name}`);
  }
  return value;
}

function getMongoClient() {
  if (mongoClientPromise) return mongoClientPromise;

  const client = new MongoClient(requiredEnv("MONGODB_URI"), {
    serverSelectionTimeoutMS: 8000,
    connectTimeoutMS: 8000,
    waitQueueTimeoutMS: 5000,
    socketTimeoutMS: 10000,
    maxPoolSize: 10
  });
  let timeout;
  const connectionAttempt = Promise.race([
    client.connect(),
    new Promise((_, reject) => {
      timeout = setTimeout(() => reject(new Error("MongoDB connection timed out after 8 seconds")), 8000);
    })
  ]).then(() => client);

  const sharedAttempt = connectionAttempt
    .catch(async (error) => {
      if (mongoClientPromise === sharedAttempt) mongoClientPromise = undefined;
      void client.close().catch(() => {});
      throw error;
    })
    .finally(() => clearTimeout(timeout));
  mongoClientPromise = sharedAttempt;
  return sharedAttempt;
}

function ensureDesignIndexes(db) {
  if (!designIndexesPromise) {
    designIndexesPromise = db.collection("designs").createIndexes([
      { key: { createdAt: -1 }, name: "designs_createdAt_desc" },
      { key: { createdAt: -1, designId: -1 }, name: "designs_createdAt_designId_desc" },
      { key: { hasOrder: -1, createdAt: -1, designId: -1 }, name: "designs_order_priority" },
      { key: { finalDesignUrl: 1 }, name: "designs_finalDesignUrl" },
      { key: { designId: 1 }, name: "designs_designId" }
    ]).then((result) => {
      designIndexesReady = true;
      return result;
    }).catch((error) => {
      designIndexesPromise = null;
      designIndexesReady = false;
      throw error;
    });
  }

  return designIndexesPromise;
}

function warmDesignIndexes(db) {
  ensureDesignIndexes(db).catch((error) => {
    console.warn("Design index warmup failed", { error: error.message || String(error) });
  });
}

function ensureDesignOrderPriority(db) {
  if (!designOrderPriorityPromise) {
    designOrderPriorityPromise = db.collection("designs").updateMany(
      { hasOrder: { $exists: false } },
      [{
        $set: {
          hasOrder: {
            $or: [
              { $ne: [{ $ifNull: ["$orderName", ""] }, ""] },
              { $ne: [{ $ifNull: ["$orderNumber", ""] }, ""] },
              { $ne: [{ $ifNull: ["$orderId", ""] }, ""] }
            ]
          }
        }
      }]
    ).catch((error) => {
      designOrderPriorityPromise = null;
      throw error;
    });
  }
  return designOrderPriorityPromise;
}

function verifyShopifyWebhook(rawBody, hmacHeader) {
  if (!hmacHeader) return false;

  const calculated = crypto
    .createHmac("sha256", requiredEnv("SHOPIFY_WEBHOOK_SECRET"))
    .update(rawBody)
    .digest("base64");

  const receivedBuffer = Buffer.from(hmacHeader, "base64");
  const calculatedBuffer = Buffer.from(calculated, "base64");
  if (receivedBuffer.length !== calculatedBuffer.length) return false;

  return crypto.timingSafeEqual(receivedBuffer, calculatedBuffer);
}

function getLineItemProperty(lineItem, propertyName) {
  const target = propertyName.toLowerCase();
  const property = (lineItem.properties || []).find((item) =>
    String(item.name || "").trim().toLowerCase() === target
  );
  return property ? String(property.value || "").trim() : "";
}

function getOrderCustomerName(order) {
  const customer = order.customer || {};
  return [customer.first_name, customer.last_name].filter(Boolean).join(" ").trim();
}

function getShopifyLineItemSize(lineItem) {
  const label = [lineItem.variant_title, getLineItemProperty(lineItem, "Size"), getLineItemProperty(lineItem, "Stamp Size")]
    .filter(Boolean).join(" ").replace(/[–—]/g, "-").trim();
  const normalized = label.toLowerCase();
  let key = "";
  if (/(^|\D)10\s*(inch|in|")\b/.test(normalized) || /(^|\s)(xxl|2xl)(\s|$|-)/.test(normalized)) key = "xxl";
  else if (/(^|\D)8\s*(inch|in|")\b/.test(normalized) || /(^|\s)xl(\s|$|-)/.test(normalized)) key = "xl";
  else if (/(^|\D)6\s*(inch|in|")\b/.test(normalized) || /(^|\s)l(\s|$|-)/.test(normalized)) key = "l";
  else if (/(^|\D)4\s*(inch|in|")\b/.test(normalized) || /(^|\s)m(\s|$|-)/.test(normalized)) key = "m";
  else if (/(^|\D)3\s*(inch|in|")\b/.test(normalized) || /(^|\s)s(\s|$|-)/.test(normalized)) key = "s";
  return { key, label };
}

app.post("/api/shopify/orders-create", express.raw({ type: "application/json", limit: "5mb" }), async (req, res) => {
  try {
    const hmac = req.get("x-shopify-hmac-sha256");
    if (!verifyShopifyWebhook(req.body, hmac)) {
      res.status(401).send("Invalid webhook signature");
      return;
    }

    const order = JSON.parse(req.body.toString("utf8"));
    const shopDomain = req.get("x-shopify-shop-domain") || "";
    const webhookId = req.get("x-shopify-webhook-id") || "";
    const lineItems = Array.isArray(order.line_items) ? order.line_items : [];
    const designIds = Array.from(new Set(
      lineItems
        .map((lineItem) =>
          getLineItemProperty(lineItem, "_Design ID") ||
          getLineItemProperty(lineItem, "Design ID") ||
          getLineItemProperty(lineItem, "Reference ID")
        )
        .filter(Boolean)
    ));

    if (!designIds.length) {
      console.warn("Shopify orders/create webhook received with no Design ID properties", {
        orderName: order.name || order.order_number || "",
        webhookId,
        lineItemCount: lineItems.length
      });
      res.status(200).send("No design IDs found");
      return;
    }

    const orderPayload = {
      hasOrder: true,
      orderId: String(order.id || ""),
      orderName: order.name || (order.order_number ? `#${order.order_number}` : ""),
      orderNumber: order.order_number || "",
      orderCreatedAt: order.created_at ? new Date(order.created_at) : new Date(),
      shopDomain,
      customerEmail: order.email || order.contact_email || "",
      customerName: getOrderCustomerName(order),
      updatedAt: new Date()
    };

    const client = await getMongoClient();
    const db = client.db(process.env.MONGODB_DB_NAME || "stamptrial");
    const updateResult = await db.collection("designs").updateMany(
      { designId: { $in: designIds } },
      {
        $set: orderPayload,
        ...(webhookId ? { $addToSet: { webhookIds: webhookId } } : {})
      }
    );

    const sizeUpdates = lineItems.map((lineItem) => {
      const designId = getLineItemProperty(lineItem, "_Design ID") ||
        getLineItemProperty(lineItem, "Design ID") ||
        getLineItemProperty(lineItem, "Reference ID");
      const size = getShopifyLineItemSize(lineItem);
      return designId && size.key ? {
        updateOne: {
          filter: { designId },
          update: { $set: { "settings.selectedSize": size.key, "settings.selectedSizeLabel": size.label } }
        }
      } : null;
    }).filter(Boolean);
    if (sizeUpdates.length) {
      await db.collection("designs").bulkWrite(sizeUpdates, { ordered: false });
    }

    console.info("Shopify orders/create webhook processed", {
      orderName: orderPayload.orderName,
      designIds,
      matchedCount: updateResult.matchedCount,
      modifiedCount: updateResult.modifiedCount,
      webhookId
    });

    dashboardMetricsCache = null;
    broadcastDashboardEvent("order_created", { designIds });
    res.status(200).send("OK");
  } catch (error) {
    console.error("Shopify orders/create webhook failed:", error);
    res.status(500).send("Webhook failed");
  }
});

app.use(express.json({ limit: "35mb" }));

const DASHBOARD_COOKIE = "stamp_dashboard_session";
const DASHBOARD_SESSION_SECONDS = 12 * 60 * 60;
const dashboardLoginAttempts = new Map();

function dashboardDigest(value) {
  return crypto.createHash("sha256").update(String(value)).digest();
}

function dashboardSessionSignature(expiresAt) {
  const secret = process.env.DASHBOARD_SESSION_SECRET || process.env.DASHBOARD_PASSWORD || "";
  return crypto.createHmac("sha256", secret)
    .update(`${process.env.DASHBOARD_USERNAME || "admin"}.${expiresAt}`)
    .digest("base64url");
}

function createDashboardSession() {
  const expiresAt = Math.floor(Date.now() / 1000) + DASHBOARD_SESSION_SECONDS;
  return `${expiresAt}.${dashboardSessionSignature(expiresAt)}`;
}

function hasValidDashboardSession(req) {
  const cookieHeader = req.get("cookie") || "";
  const cookies = Object.fromEntries(cookieHeader.split(";").map((part) => {
    const separator = part.indexOf("=");
    return separator < 0 ? [part.trim(), ""] : [part.slice(0, separator).trim(), decodeURIComponent(part.slice(separator + 1))];
  }));
  const token = cookies[DASHBOARD_COOKIE] || "";
  const separator = token.indexOf(".");
  if (separator < 0) return false;
  const expiresAt = Number(token.slice(0, separator));
  if (!Number.isFinite(expiresAt) || expiresAt <= Math.floor(Date.now() / 1000)) return false;
  const supplied = token.slice(separator + 1);
  const expected = dashboardSessionSignature(expiresAt);
  return crypto.timingSafeEqual(dashboardDigest(supplied), dashboardDigest(expected));
}

function dashboardCookie(req, value, maxAge) {
  const forwardedProtocol = String(req.get("x-forwarded-proto") || "").split(",")[0].trim();
  const secure = req.secure || forwardedProtocol === "https" || process.env.NODE_ENV === "production";
  return `${DASHBOARD_COOKIE}=${encodeURIComponent(value)}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${secure ? "; Secure" : ""}`;
}

app.post("/api/dashboard-login", (req, res) => {
  const expectedPassword = process.env.DASHBOARD_PASSWORD;
  const expectedUsername = process.env.DASHBOARD_USERNAME || "admin";
  if (!expectedPassword) {
    res.status(503).json({ error: "Dashboard authentication is not configured." });
    return;
  }

  const key = req.ip || req.socket.remoteAddress || "unknown";
  const now = Date.now();
  const attempt = dashboardLoginAttempts.get(key);
  if (attempt && attempt.resetAt > now && attempt.count >= 10) {
    res.setHeader("Retry-After", String(Math.ceil((attempt.resetAt - now) / 1000)));
    res.status(429).json({ error: "Too many login attempts. Try again later." });
    return;
  }

  const username = String(req.body?.username || "");
  const password = String(req.body?.password || "");
  const validUsername = crypto.timingSafeEqual(dashboardDigest(username), dashboardDigest(expectedUsername));
  const validPassword = crypto.timingSafeEqual(dashboardDigest(password), dashboardDigest(expectedPassword));
  if (!validUsername || !validPassword) {
    const current = attempt && attempt.resetAt > now ? attempt : { count: 0, resetAt: now + 15 * 60 * 1000 };
    current.count++;
    dashboardLoginAttempts.set(key, current);
    res.status(401).json({ error: "Incorrect username or password." });
    return;
  }

  dashboardLoginAttempts.delete(key);
  res.setHeader("Set-Cookie", dashboardCookie(req, createDashboardSession(), DASHBOARD_SESSION_SECONDS));
  res.setHeader("Cache-Control", "no-store");
  res.json({ ok: true });
});

app.post("/api/dashboard-logout", (req, res) => {
  res.setHeader("Set-Cookie", dashboardCookie(req, "", 0));
  res.setHeader("Cache-Control", "no-store");
  res.json({ ok: true });
});

function dashboardAuth(req, res, next) {
  const protectsDashboard = req.path === "/dashboard.html" ||
    req.path === "/api/designs" ||
    req.path === "/api/design-count" ||
    req.path === "/api/design-metrics" ||
    req.path === "/api/dashboard-events" ||
    /^\/api\/designs\/[^/]+\/status$/.test(req.path);
  if (!protectsDashboard) {
    next();
    return;
  }
  if (hasValidDashboardSession(req)) {
    res.setHeader("Cache-Control", "private, no-store");
    next();
    return;
  }
  if (req.path === "/dashboard.html") {
    res.redirect(302, "/dashboard-login.html");
    return;
  }
  res.status(401).json({ error: "Authentication required." });
}

app.use(dashboardAuth);
app.use(express.static("public"));

function getGeneratedImageUrls(data) {
  const images = Array.isArray(data.images)
    ? data.images
    : Array.isArray(data.data && data.data.images)
      ? data.data.images
      : [];

  return images
    .map((image) => {
      if (typeof image === "string") return image;
      return image.url || image.image_url || image.data_url || "";
    })
    .filter(Boolean)
    .slice(0, 4);
}

function parseDataUrl(dataUrl) {
  const match = /^data:([^;,]+)(;base64)?,(.*)$/s.exec(dataUrl || "");
  if (!match) {
    throw new Error("Invalid image data");
  }

  const mimeType = match[1];
  const isBase64 = Boolean(match[2]);
  const body = match[3];
  const buffer = isBase64
    ? Buffer.from(body, "base64")
    : Buffer.from(decodeURIComponent(body), "utf8");

  return { buffer, mimeType };
}

function msSince(start) {
  return Date.now() - start;
}

function extensionFromMime(mimeType) {
  if (mimeType === "image/jpeg") return "jpg";
  if (mimeType === "image/webp") return "webp";
  if (mimeType === "image/svg+xml") return "svg";
  return "png";
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function addCacheBuster(url, key) {
  const separator = url.includes("?") ? "&" : "?";
  return `${url}${separator}v=${encodeURIComponent(key)}`;
}

async function waitForPublicImageUrl(url, { attempts = 8, delayMs = 450 } = {}) {
  let lastError = "";

  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      const response = await fetch(url, {
        method: "HEAD",
        headers: {
          "Cache-Control": "no-cache"
        }
      });

      if (response.ok) return;
      lastError = `${response.status} ${response.statusText}`.trim();
    } catch (error) {
      lastError = error.message || String(error);
    }

    if (attempt < attempts) {
      await sleep(delayMs * attempt);
    }
  }

  throw new Error(`Uploaded image URL is not publicly accessible yet: ${lastError || "unknown error"}`);
}

async function uploadToBunny(path, dataUrl) {
  const storageZone = requiredEnv("BUNNY_STORAGE_ZONE");
  const storagePassword = requiredEnv("BUNNY_STORAGE_PASSWORD");
  const storageEndpoint = (process.env.BUNNY_STORAGE_ENDPOINT || "https://storage.bunnycdn.com").replace(/\/$/, "");
  const cdnBaseUrl = requiredEnv("BUNNY_CDN_BASE_URL").replace(/\/$/, "");
  const { buffer, mimeType } = parseDataUrl(dataUrl);

  const uploadUrl = `${storageEndpoint}/${storageZone}/${path}`;
  const response = await fetch(uploadUrl, {
    method: "PUT",
    headers: {
      AccessKey: storagePassword,
      "Content-Type": mimeType
    },
    body: buffer
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`Bunny upload failed (${response.status}): ${body || response.statusText}`);
  }

  return `${cdnBaseUrl}/${path}`;
}

async function uploadRemoteImageToBunny(path, imageUrl) {
  const storageZone = requiredEnv("BUNNY_STORAGE_ZONE");
  const storagePassword = requiredEnv("BUNNY_STORAGE_PASSWORD");
  const storageEndpoint = (process.env.BUNNY_STORAGE_ENDPOINT || "https://storage.bunnycdn.com").replace(/\/$/, "");
  const cdnBaseUrl = requiredEnv("BUNNY_CDN_BASE_URL").replace(/\/$/, "");

  const imageResponse = await fetch(imageUrl);
  if (!imageResponse.ok) {
    throw new Error(`Generated image download failed (${imageResponse.status}): ${imageResponse.statusText}`);
  }

  const mimeType = imageResponse.headers.get("content-type")?.split(";")[0] || "image/png";
  const buffer = Buffer.from(await imageResponse.arrayBuffer());
  const uploadUrl = `${storageEndpoint}/${storageZone}/${path}`;
  const response = await fetch(uploadUrl, {
    method: "PUT",
    headers: {
      AccessKey: storagePassword,
      "Content-Type": mimeType
    },
    body: buffer
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`Bunny generated image upload failed (${response.status}): ${body || response.statusText}`);
  }

  return `${cdnBaseUrl}/${path}`;
}

function getGenerationCacheKey({ buffer, mimeType }) {
  return crypto
    .createHash("sha256")
    .update(GENERATION_CACHE_VERSION)
    .update("\0")
    .update(LINE_ART_PROMPT)
    .update("\0")
    .update(mimeType)
    .update("\0")
    .update(buffer)
    .digest("hex");
}

async function persistGeneratedImageUrls(imageUrls, cacheKey) {
  return Promise.all(imageUrls.map(async (url, index) => {
    try {
      const imageResponse = await fetch(url, { method: "HEAD" }).catch(() => null);
      const mimeType = imageResponse?.headers?.get("content-type")?.split(";")[0] || "image/png";
      const ext = extensionFromMime(mimeType);
      return await uploadRemoteImageToBunny(
        `generated-line-art/${cacheKey}/variant-${index + 1}-${crypto.randomUUID()}.${ext}`,
        url
      );
    } catch (error) {
      console.warn("Generated image persistence skipped", { url, error: error.message });
      return url;
    }
  }));
}

async function requestLineArtProvider(sourceImageUrl) {
  const response = await fetch("https://fal.run/openai/gpt-image-2/edit", {
    method: "POST",
    headers: {
      Authorization: `Key ${requiredEnv("FAL_API_KEY")}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      prompt: LINE_ART_PROMPT,
      image_urls: [sourceImageUrl],
      image_size: "auto",
      quality: "low",
      num_images: 4,
      output_format: "png",
      sync_mode: true
    })
  });

  const data = await response.json().catch(() => ({}));
  return { response, data };
}

function isProviderImageDownloadError(data) {
  const details = Array.isArray(data && data.detail)
    ? data.detail
    : [data && data.detail, data && data.error, data && data.message].filter(Boolean);

  return details.some((detail) => {
    const text = typeof detail === "string"
      ? detail
      : [detail && detail.msg, detail && detail.message, detail && detail.type].filter(Boolean).join(" ");

    return /file_download_error|download|not accessible|expired|image url/i.test(text);
  });
}

app.get("/api/health", (_req, res) => {
  res.json({ ok: true });
});

const LINE_ART_PROMPT = `Convert the uploaded reference image into bold black vector-style logo line art on a pure white background — a clean emblem/icon conversion with crisp, smooth, manually-traced-looking contours. Use the uploaded image as the source of truth for subject, pose, silhouette, proportions, and layout.
 
STYLE
Bold black outlines on a pure white background. High-contrast black and white only — no gray, no color. Smooth vector-quality curves and straight segments matching the source's actual geometry (smooth where curved, sharp corners only where the source has real corners). Strokes must be crisp and hard-edged: no blur, feathering, fuzz, or low-resolution edges. White-dominant result — black appears as strokes/details, not as filled background. Clean enclosed white negative space between lines. No sketch, pencil, brush, watercolor, or halftone texture; no rough hand-drawn wobble; no thin fragile lines; no low-detail cartoon look; no inverted look or mostly-black badge.
 
TRANSFORMATION
Convert visible subject edges, key internal edges, and major shadows into clean black vector paths. Keep essential filled-black areas only where needed for readability (eyes, eyebrows, lips, deep shadows, dark graphic details); keep other areas white. Use thick strokes for contours rather than solid fills. Remove photographic texture, gradients, skin tones, color, noise, soft lighting, and background clutter. If the source is already a logo/graphic, preserve its geometry and just clean up the edges. If the source is a photo, simplify only enough to produce a clean line-art version while keeping the likeness and geometry intact.
 
IDENTITY LOCK (non-negotiable)
The output must be immediately recognizable as the exact same subject — same core elements, count, position, structure, proportions, symmetry, spacing, and negative space as the source. Do not alter, remove, merge, duplicate, reposition, reinterpret, or oversimplify any distinguishing feature (facial features, object parts, marks, accessories, defining shapes). When unsure if a detail is "core," preserve it.
 
SMALL MARKS (critical)
Any ™, ®, ©, monogram, tiny text, or small secondary mark in the source must appear in the output, in the same position and scale, in clean vector line form. Before finalizing, scan the full source edge-to-edge (including corners/periphery) and confirm every mark is reproduced — never drop or shrink one into illegibility for being small.
 
DO NOT
Do not produce a realistic portrait, shaded sketch, pencil drawing, or generic clipart. Do not fill a black disk/square behind the subject or turn white space into black masses. Do not invent ornaments, backgrounds, frames, or decorative scenery. Do not add text, letters, TM marks, logos, or watermarks not present in the source. Do not copy outside brand artwork unless the source itself is that artwork. Do not change any core feature of the original subject.
 
Result should look like a bold black-and-white vector logo outline, print/engrave-ready, with the exact identity, core elements, and any small marks (™/®/©) of the original preserved.

If the source contains readable words or lettering, preserve the exact spelling, letter count, placement, and hierarchy.
 `;

app.post("/api/generate-line-art", async (req, res) => {
  const requestId = crypto.randomUUID().slice(0, 8);
  const requestStartedAt = Date.now();
  const timings = {};

  try {
    const { imageDataUrl, forceRegenerate = false } = req.body || {};
    if (!imageDataUrl) {
      res.status(400).json({ error: "imageDataUrl is required" });
      return;
    }

    console.info("Line art generation started", {
      requestId,
      forceRegenerate: Boolean(forceRegenerate),
      payloadKb: Math.round(String(imageDataUrl).length / 1024)
    });

    const parseStartedAt = Date.now();
    const parsedSource = parseDataUrl(imageDataUrl);
    timings.parseMs = msSince(parseStartedAt);
    timings.sourceKb = Math.round(parsedSource.buffer.length / 1024);
    const generationCacheKey = getGenerationCacheKey(parsedSource);
    const client = await getMongoClient();
    const db = client.db(process.env.MONGODB_DB_NAME || "stamptrial");
    const generationCache = db.collection("generation_cache");
    const now = new Date();

    if (!forceRegenerate) {
      const cacheStartedAt = Date.now();
      const cachedGeneration = await generationCache.findOne({
        cacheKey: generationCacheKey,
        expiresAt: { $gt: now },
        imageUrls: { $type: "array", $ne: [] }
      });
      timings.cacheLookupMs = msSince(cacheStartedAt);

      if (cachedGeneration) {
        timings.totalMs = msSince(requestStartedAt);
        console.info("Line art generation cache hit", {
          requestId,
          imageCount: cachedGeneration.imageUrls.length,
          timings
        });
        res.json({
          imageUrls: cachedGeneration.imageUrls.slice(0, 4),
          cached: true,
          timings
        });
        return;
      }
    }

    const sourceExt = extensionFromMime(parsedSource.mimeType);
    const bunnyUploadStartedAt = Date.now();
    const sourceUploadPromise = uploadToBunny(`generation-inputs/${crypto.randomUUID()}.${sourceExt}`, imageDataUrl);
    sourceUploadPromise
      .then(() => {
        timings.bunnyUploadMs = msSince(bunnyUploadStartedAt);
        console.info("Generation input background upload completed", {
          requestId,
          bunnyUploadMs: timings.bunnyUploadMs
        });
      })
      .catch((error) => {
        timings.bunnyUploadFailedMs = msSince(bunnyUploadStartedAt);
        console.warn("Generation input background upload failed", {
          requestId,
          bunnyUploadFailedMs: timings.bunnyUploadFailedMs,
          error: error.message || String(error)
        });
      });

    let providerInput = "data-uri";
    const providerStartedAt = Date.now();
    let { response, data } = await requestLineArtProvider(imageDataUrl);
    timings.providerDirectMs = msSince(providerStartedAt);

    if (!response.ok) {
      const fallbackStartedAt = Date.now();
      console.warn("Direct line art provider request failed; falling back to Bunny URL", {
        requestId,
        status: response.status,
        detail: data.detail || data.error || data.message || data,
        timings
      });

      const sourceImageUrl = await sourceUploadPromise;
      if (!timings.bunnyUploadMs) timings.bunnyUploadMs = msSince(bunnyUploadStartedAt);
      let providerImageUrl = addCacheBuster(sourceImageUrl, crypto.randomUUID());

      const publicWaitStartedAt = Date.now();
      await waitForPublicImageUrl(providerImageUrl);
      timings.bunnyPublicWaitMs = msSince(publicWaitStartedAt);

      providerInput = "bunny-url";
      const fallbackProviderStartedAt = Date.now();
      ({ response, data } = await requestLineArtProvider(providerImageUrl));
      timings.providerFallbackMs = msSince(fallbackProviderStartedAt);
      timings.fallbackTotalMs = msSince(fallbackStartedAt);

      if (!response.ok && response.status === 422 && isProviderImageDownloadError(data)) {
        const retryStartedAt = Date.now();
        await sleep(1200);
        providerImageUrl = addCacheBuster(sourceImageUrl, crypto.randomUUID());
        await waitForPublicImageUrl(providerImageUrl, { attempts: 10, delayMs: 600 });
        ({ response, data } = await requestLineArtProvider(providerImageUrl));
        timings.providerRetryMs = msSince(retryStartedAt);
      }
    }

    if (!response.ok) {
      timings.totalMs = msSince(requestStartedAt);
      console.warn("Line art provider rejected request", {
        requestId,
        status: response.status,
        detail: data.detail || data.error || data.message || data,
        timings
      });
      res.status(response.status).json({ error: data.detail || data.error || data.message || "Generation failed" });
      return;
    }

    const imageUrls = getGeneratedImageUrls(data);
    if (!imageUrls.length) {
      res.status(502).json({ error: "No generated images were returned" });
      return;
    }

    const immediateImageUrls = imageUrls.slice(0, 4);
    timings.totalMs = msSince(requestStartedAt);
    console.info("Line art generation completed", {
      requestId,
      providerInput,
      imageCount: immediateImageUrls.length,
      timings
    });
    res.json({ imageUrls: immediateImageUrls, cached: false, persistence: "pending", providerInput, timings });

    const persistenceStartedAt = Date.now();
    persistGeneratedImageUrls(immediateImageUrls, generationCacheKey)
      .then((persistentImageUrls) =>
        generationCache.updateOne(
          { cacheKey: generationCacheKey },
          {
            $set: {
              cacheKey: generationCacheKey,
              cacheVersion: GENERATION_CACHE_VERSION,
              imageUrls: persistentImageUrls.slice(0, 4),
              sourceMimeType: parsedSource.mimeType,
              updatedAt: new Date(),
              expiresAt: new Date(Date.now() + GENERATION_CACHE_TTL_MS)
            },
            $setOnInsert: { createdAt: new Date() }
          },
          { upsert: true }
        )
      )
      .then(() => {
        console.info("Generated image background persistence completed", {
          requestId,
          cacheKey: generationCacheKey,
          persistenceMs: msSince(persistenceStartedAt)
        });
      })
      .catch((error) => {
        console.warn("Generated image background persistence failed", {
          requestId,
          cacheKey: generationCacheKey,
          persistenceMs: msSince(persistenceStartedAt),
          error: error.message || String(error)
        });
      });
  } catch (error) {
    console.error("Line art generation failed", {
      requestId,
      totalMs: msSince(requestStartedAt),
      error
    });
    res.status(500).json({ error: "Could not generate line art variants" });
  }
});

app.post("/api/save-design", async (req, res) => {
  try {
    const {
      designId: requestedDesignId,
      originalImageDataUrl,
      chosenVariantDataUrl,
      finalDesignDataUrl,
      lightweight = false,
      settings = {}
    } = req.body || {};

    const hasValidDesignId = /^des_[a-f0-9-]{36}$/i.test(String(requestedDesignId || ""));
    const hasOriginalImage = Boolean(originalImageDataUrl);
    const hasChosenVariant = Boolean(chosenVariantDataUrl);
    const hasFinalDesign = Boolean(finalDesignDataUrl);

    if (hasOriginalImage !== hasChosenVariant) {
      res.status(400).json({ error: "originalImageDataUrl and chosenVariantDataUrl must be sent together" });
      return;
    }

    if (!hasOriginalImage && !hasFinalDesign && !lightweight) {
      res.status(400).json({ error: "No design data was provided" });
      return;
    }

    if (!hasOriginalImage && !lightweight && (!hasValidDesignId || !hasFinalDesign)) {
      res.status(400).json({ error: "originalImageDataUrl and chosenVariantDataUrl are required for new designs" });
      return;
    }

    const designId = hasValidDesignId ? String(requestedDesignId) : `des_${crypto.randomUUID()}`;
    const assetKey = crypto.randomUUID();

    const uploadJobs = [];
    if (hasOriginalImage) {
      const originalExt = extensionFromMime(parseDataUrl(originalImageDataUrl).mimeType);
      const variantExt = extensionFromMime(parseDataUrl(chosenVariantDataUrl).mimeType);
      uploadJobs.push([
        "originalImageUrl",
        uploadToBunny(`designs/${designId}/original-${assetKey}.${originalExt}`, originalImageDataUrl)
      ]);
      uploadJobs.push([
        "chosenVariantUrl",
        uploadToBunny(`designs/${designId}/chosen-variant-${assetKey}.${variantExt}`, chosenVariantDataUrl)
      ]);
    }
    if (hasFinalDesign) {
      uploadJobs.push([
        "finalDesignUrl",
        uploadToBunny(`designs/${designId}/final-design-${assetKey}.${extensionFromMime(parseDataUrl(finalDesignDataUrl).mimeType)}`, finalDesignDataUrl)
      ]);
    }

    const uploadedEntries = await Promise.all(uploadJobs.map(async ([key, promise]) => [key, await promise]));
    const uploadedUrls = Object.fromEntries(uploadedEntries);

    const client = await getMongoClient();
    const db = client.db(process.env.MONGODB_DB_NAME || "stamptrial");
    const design = {
      designId,
      settings,
      updatedAt: new Date()
    };

    if (uploadedUrls.originalImageUrl) design.originalImageUrl = uploadedUrls.originalImageUrl;
    if (uploadedUrls.chosenVariantUrl) design.chosenVariantUrl = uploadedUrls.chosenVariantUrl;
    if (uploadedUrls.finalDesignUrl) design.finalDesignUrl = uploadedUrls.finalDesignUrl;

    await db.collection("designs").updateOne(
      { designId },
      {
        $set: design,
        $setOnInsert: { createdAt: new Date(), hasOrder: false }
      },
      { upsert: true }
    );
    dashboardMetricsCache = null;
    broadcastDashboardEvent("design_saved", { designId });
    res.json({ designId, ...uploadedUrls });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Could not save design" });
  }
});

function escapeRegex(value) {
  return String(value || "").replace(/[.*+?^{}()|[\]\\]/g, "\\$&");
}

function buildDashboardFilter(query = {}) {
  const filters = [];
  const search = String(query.q || "").trim();
  if (search) {
    const pattern = new RegExp(escapeRegex(search), "i");
    filters.push({ $or: [
      { designId: pattern }, { orderName: pattern }, { orderNumber: pattern },
      { customerName: pattern }, { customerEmail: pattern },
      { "settings.aboveText": pattern }, { "settings.belowText": pattern },
      { "settings.notesForDesigner": pattern }
    ] });
  }
  if (query.size) filters.push({ "settings.selectedSize": String(query.size) });
  if (query.final === "yes") filters.push({ finalDesignUrl: { $exists: true, $nin: [null, ""] } });
  if (query.final === "no") filters.push({ $or: [{ finalDesignUrl: { $exists: false } }, { finalDesignUrl: { $in: [null, ""] } }] });

  const status = String(query.status || "all");
  const hasFinal = { finalDesignUrl: { $exists: true, $nin: [null, ""] } };
  const noFinal = { $or: [{ finalDesignUrl: { $exists: false } }, { finalDesignUrl: { $in: [null, ""] } }] };
  const automatic = { $or: [{ workflowStatus: { $exists: false } }, { workflowStatus: { $in: [null, "", "new_order"] } }] };
  if (status === "ordered") filters.push({ hasOrder: true });
  if (status === "awaiting_order") filters.push({ hasOrder: false });
  if (status === "new_order") filters.push({ $and: [{ hasOrder: true }, automatic, noFinal] });
  if (status === "in_production") filters.push({ workflowStatus: "in_production" });
  if (status === "ready") filters.push({ $or: [{ workflowStatus: "ready" }, { $and: [automatic, hasFinal] }] });
  if (status === "completed") filters.push({ workflowStatus: "completed" });
  if (status === "needs_attention") filters.push({ $and: [{ hasOrder: true }, { workflowStatus: { $ne: "completed" } }, noFinal] });

  const days = Number(query.days);
  if ([1, 7, 30, 90].includes(days)) filters.push({ createdAt: { $gte: new Date(Date.now() - days * 86_400_000) } });
  return filters.length ? { $and: filters } : {};
}

app.get("/api/dashboard-events", (req, res) => {
  res.status(200);
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders?.();
  res.write("retry: 5000\n\n");
  dashboardEventClients.add(res);
  req.on("close", () => dashboardEventClients.delete(res));
});

app.get("/api/design-metrics", async (_req, res) => {
  try {
    if (dashboardMetricsCache && dashboardMetricsCache.expiresAt > Date.now()) {
      res.json({ metrics: dashboardMetricsCache.metrics, cached: true });
      return;
    }
    const client = await getMongoClient();
    const db = client.db(process.env.MONGODB_DB_NAME || "stamptrial");
    const collection = db.collection("designs");
    const [total, ordered, finalReady, needsAttention] = await Promise.all([
      collection.countDocuments({}),
      collection.countDocuments({ hasOrder: true }),
      collection.countDocuments({ finalDesignUrl: { $exists: true, $nin: [null, ""] } }),
      collection.countDocuments({ hasOrder: true, workflowStatus: { $ne: "completed" }, $or: [{ finalDesignUrl: { $exists: false } }, { finalDesignUrl: { $in: [null, ""] } }] })
    ]);
    const metrics = { total, ordered, awaiting: total - ordered, finalReady, needsAttention };
    dashboardMetricsCache = { metrics, expiresAt: Date.now() + 30_000 };
    res.json({ metrics });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Could not load dashboard metrics" });
  }
});

app.get("/api/design-count", async (req, res) => {
  try {
    const client = await getMongoClient();
    const db = client.db(process.env.MONGODB_DB_NAME || "stamptrial");
    res.json({ count: await db.collection("designs").countDocuments(buildDashboardFilter(req.query), { maxTimeMS: 8000 }) });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Could not count designs" });
  }
});

app.get("/api/designs", async (req, res) => {
  const startedAt = Date.now();
  const requestId = crypto.randomBytes(4).toString("hex");
  console.log("Dashboard designs request started", {
    requestId,
    limit: req.query.limit || "15",
    hasCursor: Boolean(req.query.cursor),
    status: req.query.status || "all"
  });
  try {
    const limit = Math.max(1, Math.min(50, Number(req.query.limit) || 15));
    let cursor = null;
    if (req.query.cursor) {
      try {
        cursor = JSON.parse(Buffer.from(String(req.query.cursor), "base64url").toString("utf8"));
        if (typeof cursor.hasOrder !== "boolean" || !cursor.createdAt || !cursor.designId || Number.isNaN(new Date(cursor.createdAt).getTime())) throw new Error("Invalid cursor");
      } catch {
        res.status(400).json({ error: "Invalid pagination cursor" });
        return;
      }
    }
    const mongoStartedAt = Date.now();
    const client = await getMongoClient();
    const mongoMs = msSince(mongoStartedAt);
    console.log("Dashboard Mongo acquired", { requestId, mongoMs });
    const db = client.db(process.env.MONGODB_DB_NAME || "stamptrial");
    const baseQuery = buildDashboardFilter(req.query);
    const cursorQuery = cursor ? { $or: [
      { hasOrder: { $lt: cursor.hasOrder } },
      { hasOrder: cursor.hasOrder, createdAt: { $lt: new Date(cursor.createdAt) } },
      { hasOrder: cursor.hasOrder, createdAt: new Date(cursor.createdAt), designId: { $lt: cursor.designId } }
    ] } : null;
    const query = cursorQuery ? (Object.keys(baseQuery).length ? { $and: [baseQuery, cursorQuery] } : cursorQuery) : baseQuery;
    const queryStartedAt = Date.now();
    console.log("Dashboard designs query executing", { requestId });
    const designsQuery = db.collection("designs").find(query, { projection: {
      _id: 0, designId: 1, hasOrder: 1, workflowStatus: 1,
      originalImageUrl: 1, chosenVariantUrl: 1, finalDesignUrl: 1,
      settings: 1, orderId: 1, orderName: 1, orderNumber: 1,
      orderCreatedAt: 1, customerEmail: 1, customerName: 1, createdAt: 1
    }}).sort({ hasOrder: -1, createdAt: -1, designId: -1 }).limit(limit + 1).maxTimeMS(8000).toArray();
    let queryTimeout;
    const results = await Promise.race([
      designsQuery,
      new Promise((_, reject) => {
        queryTimeout = setTimeout(() => reject(new Error("Dashboard MongoDB query timed out after 9 seconds")), 9000);
      })
    ]).finally(() => clearTimeout(queryTimeout));

    const hasMore = results.length > limit;
    const designs = hasMore ? results.slice(0, limit) : results;
    const last = designs.at(-1);
    const nextCursor = hasMore && last?.createdAt && last?.designId
      ? Buffer.from(JSON.stringify({ hasOrder: Boolean(last.hasOrder), createdAt: new Date(last.createdAt).toISOString(), designId: last.designId })).toString("base64url")
      : null;
    const queryMs = msSince(queryStartedAt);
    const totalMs = msSince(startedAt);
    console.log("Dashboard designs request completed", { requestId, returned: designs.length, hasMore, mongoMs, queryMs, totalMs });
    res.json({ designs, nextCursor, timings: { mongoMs, queryMs, totalMs, indexReady: designIndexesReady } });
  } catch (error) {
    console.error("Dashboard designs request failed", { requestId, totalMs: msSince(startedAt), error: error?.message || String(error) });
    res.status(500).json({ error: "Could not load designs" });
  }
});

app.patch("/api/designs/:designId/status", async (req, res) => {
  try {
    const designId = String(req.params.designId || "").trim();
    const workflowStatus = String(req.body?.workflowStatus || "");
    if (!/^des_[a-f0-9-]{36}$/i.test(designId) || !["new_order", "in_production", "ready", "completed"].includes(workflowStatus)) {
      res.status(400).json({ error: "Invalid design or workflow status" });
      return;
    }
    const client = await getMongoClient();
    const db = client.db(process.env.MONGODB_DB_NAME || "stamptrial");
    const result = await db.collection("designs").updateOne({ designId }, { $set: { workflowStatus, updatedAt: new Date() } });
    if (!result.matchedCount) {
      res.status(404).json({ error: "Design not found" });
      return;
    }
    broadcastDashboardEvent("status_changed", { designId, workflowStatus });
    res.json({ ok: true, workflowStatus });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Could not update workflow status" });
  }
});

app.get("/api/design-preview/:designId", async (req, res) => {
  try {
    const designId = String(req.params.designId || "").trim();
    if (!/^des_[a-f0-9-]{36}$/i.test(designId)) {
      res.status(404).send("Preview not found");
      return;
    }

    const client = await getMongoClient();
    const db = client.db(process.env.MONGODB_DB_NAME || "stamptrial");
    const design = await db.collection("designs").findOne(
      { designId },
      {
        projection: {
          _id: 0,
          finalDesignUrl: 1,
          chosenVariantUrl: 1,
          originalImageUrl: 1,
          settings: 1
        }
      }
    );

    const previewUrl = design?.finalDesignUrl ||
      design?.chosenVariantUrl ||
      design?.settings?.selectedVariantPreviewUrl ||
      design?.originalImageUrl ||
      "";

    if (!previewUrl) {
      res.status(404).send("Preview not ready");
      return;
    }

    res.setHeader("Cache-Control", "no-store");
    res.redirect(302, previewUrl);
  } catch (error) {
    console.error(error);
    res.status(500).send("Could not load design preview");
  }
});

app.use((error, req, res, _next) => {
  applyCorsHeaders(req, res);
  console.error(error);

  if (res.headersSent) return;

  const status = error.status || error.statusCode || 500;
  const message = status === 413
    ? "Uploaded image is too large. Please use an image under 10MB."
    : status === 400
      ? "Invalid request. Please try again."
      : "Server error. Please try again.";

  res.status(status).json({ error: message });
});

app.listen(port, () => {
  console.log(`Line art backend running on port ${port}`);
  getMongoClient()
    .then(() => {
      console.info("MongoDB connected");
    })
    .catch((error) => {
      console.warn("Design index startup warmup skipped", { error: error.message || String(error) });
    });
});
