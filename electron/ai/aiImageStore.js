import fs from "fs";
import path from "path";
import crypto from "crypto";
import { app } from "electron";

const ALLOWED_MIME = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
]);

const EXT_BY_MIME = {
  "image/png": ".png",
  "image/jpeg": ".jpg",
  "image/webp": ".webp",
  "image/gif": ".gif",
};

const MAX_IMAGE_BYTES = 12 * 1024 * 1024;

export function getAiImagesDir() {
  const dir = path.join(app.getPath("userData"), "ai-images");
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

export function normalizeImageMime(mimeType) {
  const mime = String(mimeType || "")
    .trim()
    .toLowerCase();
  if (mime === "image/jpg") {
    return "image/jpeg";
  }
  return mime;
}

export function assertSupportedImageMime(mimeType) {
  const mime = normalizeImageMime(mimeType);
  if (!ALLOWED_MIME.has(mime)) {
    throw new Error("Unsupported image format. Use PNG, JPG, WEBP, or GIF.");
  }
  return mime;
}

/**
 * @param {Buffer} buffer
 * @param {string} mimeType
 */
export function saveAiImage(buffer, mimeType) {
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
    throw new Error("Invalid image data.");
  }
  if (buffer.length > MAX_IMAGE_BYTES) {
    throw new Error("Image is too large. Use a file under 12 MB.");
  }

  const mime = assertSupportedImageMime(mimeType);
  const ext = EXT_BY_MIME[mime] || ".png";
  const filename = `${crypto.randomUUID()}${ext}`;
  const absolutePath = path.join(getAiImagesDir(), filename);
  fs.writeFileSync(absolutePath, buffer);
  return {
    relativePath: filename,
    absolutePath,
    mimeType: mime,
  };
}

export function resolveAiImagePath(relativePath) {
  const raw = String(relativePath || "").replace(/\\/g, "/");
  const name = path.basename(raw);
  if (!name || name.includes("..") || !/^[a-f0-9-]+\.(png|jpe?g|webp|gif)$/i.test(name)) {
    throw new Error("Invalid image reference.");
  }
  return path.join(getAiImagesDir(), name);
}

export function readAiImageBase64(relativePath, mimeType) {
  const absolutePath = resolveAiImagePath(relativePath);
  if (!fs.existsSync(absolutePath)) {
    throw new Error("Attached image file is missing.");
  }
  const buffer = fs.readFileSync(absolutePath);
  const mime = normalizeImageMime(mimeType) || "image/png";
  const safeMime = ALLOWED_MIME.has(mime) ? mime : "image/png";
  const base64 = buffer.toString("base64");
  return {
    base64,
    mimeType: safeMime,
    dataUrl: `data:${safeMime};base64,${base64}`,
    byteLength: buffer.length,
  };
}

export function deleteAiImage(relativePath) {
  try {
    if (!relativePath) {
      return;
    }
    const absolutePath = resolveAiImagePath(relativePath);
    if (fs.existsSync(absolutePath)) {
      fs.unlinkSync(absolutePath);
    }
  } catch (error) {
    console.error("[ai-images] delete failed", error);
  }
}
