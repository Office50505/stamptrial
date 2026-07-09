import "dotenv/config";
import express from "express";
import cors from "cors";
import { MongoClient } from "mongodb";
import crypto from "node:crypto";

const app = express();
const port = Number(process.env.PORT || 3000);

const allowedOrigins = (process.env.ALLOWED_ORIGINS || "")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

function isAllowedOrigin(origin) {
  if (!origin) return true;
  if (allowedOrigins.includes(origin)) return true;

  try {
    const { hostname, protocol } = new URL(origin);
    return protocol === "https:" && hostname.endsWith(".myshopify.com");
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
        .map((lineItem) => getLineItemProperty(lineItem, "Design ID"))
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

function extensionFromMime(mimeType) {
  if (mimeType === "image/jpeg") return "jpg";
  if (mimeType === "image/webp") return "webp";
  if (mimeType === "image/svg+xml") return "svg";
  return "png";
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

app.get("/api/health", (_req, res) => {
  res.json({ ok: true });
});

const LINE_ART_PROMPT = `Convert the uploaded reference image into bold black vector-style logo line art on a pure white background.

The target result should feel like a clean emblem/icon conversion: smooth thick black contours, crisp white negative space, and a polished manually traced vector look.

Use the uploaded image as the source of truth for the subject, pose, silhouette, proportions, and layout.

STYLE TARGET
- Bold black outline art.
- Pure white background.
- High-contrast black and white only.
- Smooth continuous vector-quality strokes.
- Thick confident contour lines similar to classic logo line art.
- White-dominant result: black should appear as strokes/details, not as a filled black background.
- Rounded smooth curves where the source is curved.
- Sharp clean corners where the source has corners.
- Clean enclosed white negative spaces between black lines.
- Simple, readable, premium emblem-style result.

TRANSFORMATION RULES
- Convert visible subject edges, important internal edges, and major shadows into clean black vector paths.
- Keep essential filled black areas when they make features readable, such as eyes, eyebrows, lips, deep shadows, or dark graphic details.
- Keep the interior mostly white wherever the source has open or light areas.
- Use thick black strokes for borders and contours instead of filling large regions solid black.
- Remove photographic texture, gradients, skin tones, color, noise, soft lighting, and background clutter.
- If the uploaded source already contains a graphic/logo, preserve its geometry closely.
- If the uploaded source is a photo, simplify only enough to create a clean logo-style line-art version while keeping the likeness and main geometry.

PRESERVE
- Overall composition.
- Subject placement.
- Main silhouette.
- Proportions.
- Symmetry/asymmetry from the source.
- Important facial or product features.
- Hair, clothing, object, or ornament flow when visible.
- Spacing between major elements.
- Internal negative space.
- Line direction and curve rhythm.
- Visual balance.

STRICT IDENTITY LOCK (NON-NEGOTIABLE)
- The key features and core elements of the uploaded image must remain fully recognizable and unchanged in identity, count, position, and structure.
- Do not alter, remove, merge, duplicate, reposition, or reinterpret any core subject element (e.g., facial features, object parts, distinguishing marks, accessories, or defining shapes present in the source).
- Do not simplify away any feature to the point that the subject's specific identity or distinguishing characteristics are lost.
- The line-art conversion must read as the same exact subject as the source image, not a generic or reimagined version of it.
- If uncertain whether a detail counts as "core," default to preserving it rather than omitting it.

SMALL MARK PRESERVATION (CRITICAL)
- If the uploaded source contains any trademark (™), registered (®), copyright (©) symbol, monogram, small text, or tiny secondary mark, it MUST be reproduced in the output in the same position, scale, and style-consistent line form.
- Do not drop, shrink into illegibility, or omit small marks/symbols just because they are tiny relative to the main subject.
- Treat every small mark exactly like a core element — its absence is a failed conversion, not an acceptable simplification.
- Before finalizing, scan the full source image edge-to-edge (including corners and periphery) for any symbol, initials, or mark, and confirm each one is present in the output.

LINE QUALITY
- Smooth Bezier-like curves.
- Solid black strokes and fills only.
- No gray.
- No color.
- No sketch effect.
- No pencil texture.
- No brush texture.
- No watercolor.
- No halftone.
- No rough hand-drawn wobble.
- No thin fragile lines.
- No low-detail cartoon look.
- No inverted look.
- No mostly black badge.

STRICT NEGATIVE CONSTRAINTS
- Do not make a realistic portrait.
- Do not output a shaded sketch.
- Do not output a pencil drawing.
- Do not output a generic clipart version.
- Do not create a black filled disk or black filled square behind the subject.
- Do not turn white negative spaces into black masses.
- Do not invent unrelated ornaments.
- Do not add text, letters, TM marks, logos, or watermarks unless they are clearly present in the uploaded image.
- Do not omit any trademark, registered, copyright, or small secondary mark that is present in the uploaded source.
- Do not copy any brand artwork unless the uploaded image itself is that artwork.
- Do not add backgrounds, frames, or decorative scenery.
- Do not change, remove, or reinterpret any key feature or core element of the original subject.

TARGET RESULT
The final image should look like the uploaded reference was converted into a bold black-and-white vector logo outline, with clean thick contours and selective solid black feature shapes on white, ready for printing or engraving — while preserving the exact identity, core elements, and any small marks (TM/®/©) of the original subject.`;

app.post("/api/generate-line-art", async (req, res) => {
  try {
    const { imageDataUrl } = req.body || {};
    if (!imageDataUrl) {
      res.status(400).json({ error: "imageDataUrl is required" });
      return;
    }

    const sourceExt = extensionFromMime(parseDataUrl(imageDataUrl).mimeType);
    const sourceImageUrl = await uploadToBunny(`generation-inputs/${crypto.randomUUID()}.${sourceExt}`, imageDataUrl);

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
        quality: "high",
        num_images: 4,
        output_format: "png",
        sync_mode: true
      })
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      console.warn("Line art provider rejected request", {
        status: response.status,
        detail: data.detail || data.error || data.message || data
      });
      res.status(response.status).json({ error: data.detail || data.error || data.message || "Generation failed" });
      return;
    }

    const imageUrls = getGeneratedImageUrls(data);
    if (!imageUrls.length) {
      res.status(502).json({ error: "No generated images were returned" });
      return;
    }

    res.json({ imageUrls });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Could not generate line art variants" });
  }
});

app.post("/api/save-design", async (req, res) => {
  try {
    const {
      originalImageDataUrl,
      chosenVariantDataUrl,
      finalDesignDataUrl,
      settings = {}
    } = req.body || {};

    if (!originalImageDataUrl || !chosenVariantDataUrl) {
      res.status(400).json({ error: "originalImageDataUrl and chosenVariantDataUrl are required" });
      return;
    }

    const designId = `des_${crypto.randomUUID()}`;
    const originalExt = extensionFromMime(parseDataUrl(originalImageDataUrl).mimeType);
    const variantExt = extensionFromMime(parseDataUrl(chosenVariantDataUrl).mimeType);

    const [originalImageUrl, chosenVariantUrl, finalDesignUrl] = await Promise.all([
      uploadToBunny(`designs/${designId}/original.${originalExt}`, originalImageDataUrl),
      uploadToBunny(`designs/${designId}/chosen-variant.${variantExt}`, chosenVariantDataUrl),
      finalDesignDataUrl
        ? uploadToBunny(`designs/${designId}/final-design.${extensionFromMime(parseDataUrl(finalDesignDataUrl).mimeType)}`, finalDesignDataUrl)
        : Promise.resolve(null)
    ]);

    const client = await getMongoClient();
    const db = client.db(process.env.MONGODB_DB_NAME || "stamptrial");
    const design = {
      designId,
      originalImageUrl,
      chosenVariantUrl,
      finalDesignUrl,
      settings,
      createdAt: new Date()
    };

    await db.collection("designs").insertOne(design);
    res.json({ designId, originalImageUrl, chosenVariantUrl, finalDesignUrl });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Could not save design" });
  }
});

app.get("/api/designs", async (req, res) => {
  try {
    const limit = Math.max(1, Math.min(200, Number(req.query.limit) || 100));
    const client = await getMongoClient();
    const db = client.db(process.env.MONGODB_DB_NAME || "stamptrial");
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
      .limit(limit)
      .toArray();

    res.json({ designs });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Could not load designs" });
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
});
