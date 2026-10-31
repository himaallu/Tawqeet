import { randomUUID } from "node:crypto";
import { Storage } from "@google-cloud/storage";
import JSZip from "jszip";
import mammoth from "mammoth";
import { BrainError } from "./errors";

// Replit's sidecar authenticates App Storage; no service account keys are handled here.
const ENDPOINT = "http://127.0.0.1:1106";
const storage = new Storage({
  credentials: {
    audience: "replit",
    subject_token_type: "access_token",
    token_url: `${ENDPOINT}/token`,
    type: "external_account",
    credential_source: { url: `${ENDPOINT}/credential`, format: { type: "json", subject_token_field_name: "access_token" } },
    universe_domain: "googleapis.com",
  },
  projectId: "",
});
export const MAX_UPLOAD = 10 * 1024 * 1024;
export const fileTypes: Record<string, string> = {
  pdf: "application/pdf",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
};
function objectFile(objectPath: string) {
  const dir = process.env.PRIVATE_OBJECT_DIR;
  if (!dir) throw new BrainError(503, "Private App Storage is not configured.");
  if (!/^\/objects\/brain\/[a-f0-9-]{36}$/.test(objectPath)) throw new BrainError(400, "Invalid upload reference.");
  const full = `${dir.replace(/\/$/, "")}/${objectPath.slice("/objects/".length)}`.replace(/^\//, "");
  const slash = full.indexOf("/");
  return storage.bucket(full.slice(0, slash)).file(full.slice(slash + 1));
}
export async function signUpload() {
  const objectPath = `/objects/brain/${randomUUID()}`;
  const file = objectFile(objectPath);
  const response = await fetch(`${ENDPOINT}/object-storage/signed-object-url`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      bucket_name: file.bucket.name, object_name: file.name, method: "PUT",
      expires_at: new Date(Date.now() + 900_000).toISOString(),
    }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new BrainError(503, "App Storage could not issue an upload URL.");
  const result = await response.json() as { signed_url: string };
  return { uploadUrl: result.signed_url, objectPath };
}

export async function extractUploadText(upload: { objectPath: string; name: string; size: number }) {
  const file = objectFile(upload.objectPath);
  const [exists] = await file.exists();
  if (!exists) throw new BrainError(422, "File upload has not completed. Upload the file again.");
  const [metadata] = await file.getMetadata();
  if (Number(metadata.size) > MAX_UPLOAD || Number(metadata.size) !== upload.size) {
    throw new BrainError(422, "Uploaded file size does not match the declared size or exceeds 10 MB.");
  }
  const [buffer] = await file.download({ validation: "crc32c" });
  return extractDocumentText(buffer, upload.name);
}

export async function extractDocumentText(buffer: Buffer, name: string) {
  if (!buffer.length || buffer.length > MAX_UPLOAD) throw new BrainError(422, "Use a document of at most 10 MB.");
  const ext = name.split(".").pop()!.toLowerCase();
  let text = "";
  if (ext === "pdf") {
    if (!buffer.subarray(0, 8).toString("ascii").includes("%PDF-")) throw new BrainError(422, "The file is not a valid PDF.");
    const { PDFParse } = await import("pdf-parse");
    const parser = new PDFParse({ data: buffer });
    try {
      const info = await parser.getInfo();
      if (info.total > 100) throw new BrainError(422, "Use a PDF with at most 100 pages.");
      const result = await parser.getText({ first: 30 });
      text = result.text;
    } finally { await parser.destroy(); }
  } else {
    if (buffer.readUInt16BE(0) !== 0x504b) throw new BrainError(422, "The document must be an Office DOCX or PPTX file.");
    const zip = await JSZip.loadAsync(buffer);
    const entries = Object.values(zip.files);
    const uncompressed = entries.reduce((n, f) => n + ((f as unknown as { _data?: { uncompressedSize?: number } })._data?.uncompressedSize || 0), 0);
    if (entries.length > 3000 || uncompressed > 30 * 1024 * 1024) throw new BrainError(422, "Document expands beyond the 30 MB safety limit.");
    if (ext === "docx") {
      if (!zip.file("word/document.xml")) throw new BrainError(422, "This is not a DOCX document.");
      text = (await mammoth.extractRawText({ buffer })).value;
    } else if (ext === "pptx") {
      const slides = entries.filter(f => /^ppt\/slides\/slide\d+\.xml$/.test(f.name))
        .sort((a, b) => Number(a.name.match(/\d+/)?.[0]) - Number(b.name.match(/\d+/)?.[0])).slice(0, 60);
      if (!slides.length) throw new BrainError(422, "No slides were found in this PPTX.");
      const { load } = await import("cheerio");
      for (const slide of slides) {
        const $ = load(await slide.async("string"), { xmlMode: true });
        // Only read the slide's XML text runs, never hyperlinks or embedded objects.
        $("a\\:t").each((_i, el) => { text += `${$(el).text()} `; });
        text += "\n";
      }
    } else throw new BrainError(400, "Supported files: PDF, DOCX, PPTX.");
  }
  if (text.trim().length < 40) throw new BrainError(422, "Not enough readable text was found. Scanned PDFs and image-only slides need OCR; use the short form instead.");
  return text.slice(0, 125000);
}
