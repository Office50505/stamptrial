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

app.use(cors({
  origin(origin, callback) {
    if (isAllowedOrigin(origin)) {
      callback(null, true);
      return;
    }
    callback(new Error("Origin not allowed"));
  }
}));

app.use(express.json({ limit: "35mb" }));
app.use(express.static("public"));

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
- The key features and core elements of the uploaded image must remain fully`;

app.post("/api/generate-line-art", async (req, res) => {
  try {
    const { imageDataUrl } = req.body || {};
    if (!imageDataUrl) {
      res.status(400).json({ error: "imageDataUrl is required" });
      return;
    }

    const response = await fetch("https://fal.run/openai/gpt-image-2/edit", {
      method: "POST",
      headers: {
        Authorization: `Key ${requiredEnv("FAL_API_KEY")}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        prompt: LINE_ART_PROMPT,
        image_urls: [imageDataUrl],
        image_size: "auto",
        quality: "high",
        num_images: 4,
        output_format: "png",
        sync_mode: true
      })
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
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

    const originalImageUrl = await uploadToBunny(`designs/${designId}/original.${originalExt}`, originalImageDataUrl);
    const chosenVariantUrl = await uploadToBunny(`designs/${designId}/chosen-variant.${variantExt}`, chosenVariantDataUrl);
    const finalDesignUrl = finalDesignDataUrl
      ? await uploadToBunny(`designs/${designId}/final-design.${extensionFromMime(parseDataUrl(finalDesignDataUrl).mimeType)}`, finalDesignDataUrl)
      : null;

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

app.listen(port, () => {
  console.log(`Line art backend running on port ${port}`);
});
