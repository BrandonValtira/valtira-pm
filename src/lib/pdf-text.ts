/**
 * Extract plain text from a PDF buffer (Node only).
 * Uses pdf-parse v1 via dynamic import so it loads in the Next server context without bundling issues.
 */
export async function extractPdfText(buffer: Buffer): Promise<string> {
  if (!buffer || buffer.length === 0) return "";
  try {
    const mod = await import("pdf-parse");
    const pdfParse = (mod as { default: (buf: Buffer, opts?: { max?: number }) => Promise<{ text?: string }> }).default;
    const data = await pdfParse(buffer, { max: 0 });
    return (data?.text ?? "").trim();
  } catch (err) {
    console.error("PDF text extraction failed:", err);
    return "";
  }
}
