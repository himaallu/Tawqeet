import JSZip from "jszip";
import mammoth from "mammoth";
import { PDFParse } from "pdf-parse";

/** Plain text from an uploaded PDF, DOCX, PPTX or text file (for case-study extraction). */
export async function documentText(buffer: Buffer, filename: string, mime: string): Promise<string> {
  const name = filename.toLowerCase();
  if (mime === "application/pdf" || name.endsWith(".pdf")) {
    const parser = new PDFParse({ data: new Uint8Array(buffer) });
    try {
      return (await parser.getText()).text;
    } finally {
      await parser.destroy();
    }
  }
  if (name.endsWith(".docx")) return (await mammoth.extractRawText({ buffer })).value;
  if (name.endsWith(".pptx")) {
    const zip = await JSZip.loadAsync(buffer);
    const slides = Object.keys(zip.files)
      .filter((f) => /^ppt\/slides\/slide\d+\.xml$/.test(f))
      .sort((a, b) => Number(a.match(/\d+/)![0]) - Number(b.match(/\d+/)![0]));
    const parts: string[] = [];
    for (const f of slides) {
      const xml = await zip.file(f)!.async("string");
      parts.push((xml.match(/<a:t>([^<]*)<\/a:t>/g) ?? []).map((t) => t.replace(/<\/?a:t>/g, "")).join(" "));
    }
    return parts.join("\n\n");
  }
  if (mime.startsWith("text/") || name.endsWith(".txt") || name.endsWith(".md")) return buffer.toString("utf8");
  throw new Error("Unsupported file type. Upload a PDF, DOCX, PPTX or text file.");
}
