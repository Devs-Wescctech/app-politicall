import { describe, expect, it } from "vitest";
import {
  detectImageMimeType,
  hasPdfMagic,
  imageExtensionForMimeType,
  validateImageBuffer,
} from "./upload-security";

describe("upload security helpers", () => {
  it("detects allowed image types by magic bytes", () => {
    expect(detectImageMimeType(Buffer.from([0xff, 0xd8, 0xff, 0xe0]))).toBe("image/jpeg");
    expect(detectImageMimeType(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))).toBe("image/png");
    expect(detectImageMimeType(Buffer.from("GIF89a", "ascii"))).toBe("image/gif");

    const webp = Buffer.concat([
      Buffer.from("RIFF", "ascii"),
      Buffer.from([0x00, 0x00, 0x00, 0x00]),
      Buffer.from("WEBP", "ascii"),
    ]);
    expect(detectImageMimeType(webp)).toBe("image/webp");
  });

  it("rejects files that only pretend to be images", () => {
    const htmlPayload = Buffer.from("<script>alert('xss')</script>", "utf8");

    expect(detectImageMimeType(htmlPayload)).toBeNull();
    expect(validateImageBuffer(htmlPayload)).toBeNull();
  });

  it("returns safe extensions derived from detected MIME type", () => {
    expect(imageExtensionForMimeType("image/jpeg")).toBe("jpg");
    expect(validateImageBuffer(Buffer.from("GIF87a", "ascii"))).toEqual({
      mimeType: "image/gif",
      extension: "gif",
    });
  });

  it("validates PDFs by magic bytes", () => {
    expect(hasPdfMagic(Buffer.from("%PDF-1.7\n", "ascii"))).toBe(true);
    expect(hasPdfMagic(Buffer.from("not a pdf", "ascii"))).toBe(false);
  });
});
