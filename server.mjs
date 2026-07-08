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

const LINE_ART_PROMPT = `Convert the supplied reference image into clean black vector-style line art.

This is a technical vector conversion task, NOT an artistic illustration task.

The reference image is the absolute source of truth.

Preserve the original geometry exactly.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
ABSOLUTE PRESERVATION RULES
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Do NOT redesign.

Do NOT reinterpret.

Do NOT recreate from memory.

Do NOT simplify.

Do NOT beautify.

Do NOT modernize.

Do NOT stylize.

Do NOT "improve."

Do NOT generate a similar logo.

Do NOT invent any new curves.

Do NOT change any proportions.

Every contour must follow the original reference precisely.

The output should look as if the original artwork was manually traced by an expert vector artist.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
GEOMETRY
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Preserve EXACTLY:

• overall composition
• circle shape
• border thickness
• facial proportions
• facial symmetry
• eye position
• eye shape
• eyelids
• nose
• lips
• chin
• crown geometry
• star geometry
• triangle beneath star
• hair flow
• every hair strand
• spacing between hair strands
• side ornaments
• internal negative space
• spacing between every element
• line direction
• curve radius
• intersections
• tangents
• visual balance

Every major contour in the output should align with the original artwork.

If overlaid on top of the reference, the contours should coincide.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
LINE QUALITY
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Create smooth continuous vector-quality strokes.

Uniform stroke width.

Sharp corners where appropriate.

Perfectly smooth Bézier-style curves.

No wobble.

No sketch effect.

No brush texture.

No hand-drawn imperfections.

No varying stroke weight.

No artistic interpretation.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
TRANSFORMATION
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

The ONLY allowed transformation is:

• remove solid fills
• replace filled regions with clean black outlines

Nothing else may change.

Treat every filled edge in the reference as the exact outline path.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
STRICT NEGATIVE CONSTRAINTS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Do NOT:

• redraw the face
• redraw the hair
• redraw the crown
• redraw the ornaments
• alter spacing
• alter symmetry
• alter proportions
• alter line flow
• smooth away important features
• add details
• remove details
• approximate geometry
• infer missing information
• replace with a generic version
• recreate from memory

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
TARGET RESULT
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

The final image should appear to be the original artwork converted directly into precise vector outlines, preserving every geometric relationship while only removing the fills.

This is a precision tracing task rather than an illustration task.`;

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
        quality: "low",
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
