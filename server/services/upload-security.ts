export const IMAGE_MIME_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"] as const;

export type ImageMimeType = typeof IMAGE_MIME_TYPES[number];

const IMAGE_EXTENSION_BY_MIME: Record<ImageMimeType, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
};

export function imageExtensionForMimeType(mimeType: string): string | null {
  return IMAGE_EXTENSION_BY_MIME[mimeType as ImageMimeType] ?? null;
}

export function detectImageMimeType(buffer: Buffer | Uint8Array): ImageMimeType | null {
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return "image/jpeg";
  }

  if (
    buffer.length >= 8 &&
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a
  ) {
    return "image/png";
  }

  if (buffer.length >= 6) {
    const gifHeader = Buffer.from(buffer.subarray(0, 6)).toString("ascii");
    if (gifHeader === "GIF87a" || gifHeader === "GIF89a") return "image/gif";
  }

  if (buffer.length >= 12) {
    const riff = Buffer.from(buffer.subarray(0, 4)).toString("ascii");
    const webp = Buffer.from(buffer.subarray(8, 12)).toString("ascii");
    if (riff === "RIFF" && webp === "WEBP") return "image/webp";
  }

  return null;
}

export function validateImageBuffer(buffer: Buffer | Uint8Array): { mimeType: ImageMimeType; extension: string } | null {
  const mimeType = detectImageMimeType(buffer);
  if (!mimeType) return null;

  const extension = imageExtensionForMimeType(mimeType);
  return extension ? { mimeType, extension } : null;
}

export function hasPdfMagic(buffer: Buffer | Uint8Array): boolean {
  if (buffer.length < 5) return false;
  return Buffer.from(buffer.subarray(0, 5)).toString("ascii") === "%PDF-";
}
