import "dotenv/config";
import express from "express";
import cors from "cors";
import { MongoClient } from "mongodb";
import crypto from "node:crypto";

const app = express();
const port = Number(process.env.PORT || 3000);
const GENERATION_CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const GENERATION_CACHE_VERSION = "line-art-gpt-image-2-low-v1";

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

function requiredEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing ${name}`);
  }
  return value;
}

function getMongoClient() {
  if (!mongoClientPromise) {
    mongoClientPromise = new MongoClient(requiredEnv("MONGODB_URI")).connect();
  }
  return mongoClientPromise;
}

function ensureDesignIndexes(db) {
  if (!designIndexesPromise) {
    designIndexesPromise = db.collection("designs").createIndexes([
      { key: { createdAt: -1 }, name: "designs_createdAt_desc" },
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

    console.info("Shopify orders/create webhook processed", {
      orderName: orderPayload.orderName,
      designIds,
      matchedCount: updateResult.matchedCount,
      modifiedCount: updateResult.modifiedCount,
      webhookId
    });

    res.status(200).send("OK");
  } catch (error) {
    console.error("Shopify orders/create webhook failed:", error);
    res.status(500).send("Webhook failed");
  }
});

app.use(express.json({ limit: "35mb" }));
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
        $setOnInsert: { createdAt: new Date() }
      },
      { upsert: true }
    );
    res.json({ designId, ...uploadedUrls });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Could not save design" });
  }
});

app.get("/api/designs", async (req, res) => {
  const startedAt = Date.now();
  try {
    const client = await getMongoClient();
    const db = client.db(process.env.MONGODB_DB_NAME || "stamptrial");
    warmDesignIndexes(db);
    const queryStartedAt = Date.now();
    const designs = await db.collection("designs")
      .find({}, {
        projection: {
          _id: 0,
          designId: 1,
          originalImageUrl: 1,
          chosenVariantUrl: 1,
          finalDesignUrl: 1,
          settings: 1,
          orderId: 1,
          orderName: 1,
          orderNumber: 1,
          orderCreatedAt: 1,
          customerEmail: 1,
          customerName: 1,
          createdAt: 1
        }
      })
      .sort({ createdAt: -1 })
      .allowDiskUse(true)
      .toArray();

    const timings = {
      queryMs: msSince(queryStartedAt),
      totalMs: msSince(startedAt),
      indexReady: designIndexesReady
    };

    console.info("Dashboard designs loaded", {
      count: designs.length,
      timings
    });

    res.json({ designs, timings });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Could not load designs" });
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
    .then((client) => {
      const db = client.db(process.env.MONGODB_DB_NAME || "stamptrial");
      warmDesignIndexes(db);
    })
    .catch((error) => {
      console.warn("Design index startup warmup skipped", { error: error.message || String(error) });
    });
});
