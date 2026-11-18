import JSZip from "jszip";
import { PDFDocument, PDFName } from "pdf-lib";
import { getKindForFilename, type FileKind } from "./constants";
import { stripContainerMetadata } from "./stripContainerMetadata";

export type MetadataStatus = "removed" | "present" | "not-detected";

export type MetadataField = {
  name: string;
  original?: string;
  cleaned?: string;
  status: MetadataStatus;
};

export type MetadataComparison = {
  originalFilename: string;
  cleanedFilename: string;
  format: string;
  detectedOriginalFields: MetadataField[];
  detectedCleanedFields: MetadataField[];
  removedFields: MetadataField[];
  preservedFields: MetadataField[];
  limitations: string[];
  generatedAt: string;
};

type Detected = Record<string, string>;

async function inspectImage(file: File): Promise<Detected> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const extension = file.name.split(".").pop()?.toLowerCase();
  return extension === "jpg" || extension === "jpeg" ? inspectJpegStructure(bytes) : extension === "png" ? inspectPngStructure(bytes) : extension === "gif" ? inspectGifStructure(bytes) : inspectWebpStructure(bytes);
}

function textFromBytes(bytes: Uint8Array): string {
  return new TextDecoder("latin1").decode(bytes);
}

function ascii(bytes: Uint8Array, start: number, length: number): string {
  return String.fromCharCode(...bytes.subarray(start, start + length));
}

function inspectJpegStructure(bytes: Uint8Array): Detected {
  const result: Detected = {};
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return result;
  let offset = 2;
  while (offset + 4 <= bytes.length) {
    if (bytes[offset] !== 0xff) break;
    const marker = bytes[offset + 1];
    if (marker === 0xda) break;
    if (marker === 0xff) { offset += 1; continue; }
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) { offset += 2; continue; }
    const length = (bytes[offset + 2] << 8) | bytes[offset + 3];
    if (length < 2 || offset + 2 + length > bytes.length) break;
    const payload = bytes.subarray(offset + 4, offset + 2 + length);
    if (marker === 0xe1) {
      const payloadText = textFromBytes(payload);
      if (payloadText.startsWith("Exif\0\0")) result["JPEG.EXIF"] = "present";
      else if (payloadText.includes("xmpmeta") || payloadText.includes("adobe.com/xap")) result["JPEG.XMP"] = "present";
      else result["JPEG.APP1-metadata"] = "present";
    } else if (marker === 0xed) result["JPEG.IPTC-Photoshop"] = "present";
    else if (marker === 0xfe) result["JPEG.comment"] = "present";
    offset += 2 + length;
  }
  return result;
}

function inspectPngStructure(bytes: Uint8Array): Detected {
  const result: Detected = {};
  if (bytes.length < 24 || ascii(bytes, 0, 8) !== "\x89PNG\r\n\x1a\n") return result;
  let offset = 8;
  while (offset + 12 <= bytes.length) {
    const length = new DataView(bytes.buffer, bytes.byteOffset + offset, 4).getUint32(0);
    const type = ascii(bytes, offset + 4, 4);
    if (offset + 12 + length > bytes.length) break;
    if (type === "eXIf") result["PNG.EXIF"] = "present";
    if (type === "tEXt" || type === "zTXt" || type === "iTXt") result[`PNG.${type}-text-metadata`] = "present";
    offset += 12 + length;
    if (type === "IEND") break;
  }
  return result;
}

function inspectGifStructure(bytes: Uint8Array): Detected {
  const result: Detected = {};
  if (bytes.length < 13 || !(ascii(bytes, 0, 6) === "GIF87a" || ascii(bytes, 0, 6) === "GIF89a")) return result;
  let offset = 13;
  if (bytes[10] & 0x80) offset += 3 * (1 << ((bytes[10] & 0x07) + 1));
  while (offset + 2 < bytes.length) {
    if (bytes[offset] === 0x3b) break;
    if (bytes[offset] === 0x21) {
      const label = bytes[offset + 1];
      if (label === 0xfe) result["GIF.comment"] = "present";
      else if (label === 0x01) result["GIF.plain-text"] = "present";
      else if (label === 0xff) {
        const size = bytes[offset + 2];
        const app = ascii(bytes, offset + 3, size);
        if (!app.startsWith("NETSCAPE") && !app.startsWith("ANIMEXTS")) result["GIF.application-metadata"] = "present";
      }
      offset += 2;
      while (offset < bytes.length) { const size = bytes[offset++]; offset += size; if (size === 0) break; }
      continue;
    }
    if (bytes[offset] === 0x2c) {
      if (offset + 10 >= bytes.length) break;
      const packed = bytes[offset + 9];
      offset += 10 + ((packed & 0x80) ? 3 * (1 << ((packed & 0x07) + 1)) : 0) + 1;
      while (offset < bytes.length) { const size = bytes[offset++]; offset += size; if (size === 0) break; }
      continue;
    }
    break;
  }
  return result;
}

function inspectWebpStructure(bytes: Uint8Array): Detected {
  const result: Detected = {};
  if (bytes.length < 12 || ascii(bytes, 0, 4) !== "RIFF" || ascii(bytes, 8, 4) !== "WEBP") return result;
  let offset = 12;
  while (offset + 8 <= bytes.length) {
    const size = new DataView(bytes.buffer, bytes.byteOffset + offset + 4, 4).getUint32(0, true);
    const type = ascii(bytes, offset, 4);
    if (type === "EXIF") result["WebP.EXIF"] = "present";
    if (type === "XMP ") result["WebP.XMP"] = "present";
    if (type === "ICCP") result["WebP.ICC-profile"] = "present";
    offset += 8 + size + (size & 1);
  }
  return result;
}

async function inspectPdf(file: File): Promise<Detected> {
  const result: Detected = {};
  const pdfDoc = await PDFDocument.load(await file.arrayBuffer(), { updateMetadata: false });
  const infoRef = pdfDoc.context.trailerInfo.Info;
  const info = infoRef ? pdfDoc.context.lookup(infoRef) : undefined;
  const fields: Array<[string, string]> = [
    ["Title", "PDF.Title"], ["Author", "PDF.Author"], ["Subject", "PDF.Subject"],
    ["Keywords", "PDF.Keywords"], ["Creator", "PDF.Creator"], ["Producer", "PDF.Producer"],
    ["CreationDate", "PDF.CreationDate"], ["ModDate", "PDF.ModDate"], ["Trapped", "PDF.Trapped"],
  ];
  const infoDictionary = info as { get?: (key: unknown) => unknown } | undefined;
  for (const [key, label] of fields) {
    if (infoDictionary && typeof infoDictionary.get === "function" && infoDictionary.get(PDFName.of(key))) result[label] = "present";
  }
  if (pdfDoc.catalog.get(PDFName.of("Metadata"))) result["PDF.XMP-metadata-stream"] = "present";
  return result;
}

async function inspectDocx(file: File): Promise<Detected> {
  const zip = await JSZip.loadAsync(await file.arrayBuffer());
  const result: Detected = {};
  const entries: Array<[string, string]> = [
    ["docProps/core.xml", "DOCX.core-properties"],
    ["docProps/app.xml", "DOCX.application-properties"],
    ["docProps/custom.xml", "DOCX.custom-properties"],
  ];
  for (const [path, label] of entries) {
    const entry = zip.file(path);
    if (!entry) continue;
    const xml = await entry.async("string");
    result[label] = "present";
    const fields = ["title", "subject", "creator", "keywords", "description", "lastModifiedBy", "created", "modified", "customProperties"];
    for (const field of fields) {
      if (new RegExp(`(?:[>:])${field}(?:\\s|>)`, "i").test(xml)) result[`${label}.${field}`] = "detected";
    }
  }
  // The cleaner also sanitizes identity-bearing data in WordprocessingML
  // stories. Inspect the XML content directly, not ZIP bytes (rewriting a ZIP
  // can change compression/timestamps without changing metadata).
  for (const entry of Object.values(zip.files)) {
    if (entry.dir || !/^word\/.*\.xml$/i.test(entry.name)) continue;
    const xml = await entry.async("string");
    if (/<[\w.-]+:rsids\b|\s(?:[\w.-]+:)?(?:author|initials|providerId|userId|personId|date(?:Utc)?|durableId|rsid[A-Za-z0-9_.-]*)\s*=/i.test(xml)) {
      result["DOCX.Word XML identity fields"] = "detected";
      break;
    }
  }
  return result;
}

async function inspectContainer(file: File): Promise<Detected> {
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  const result: Detected = {};
  const cleaned = await stripContainerMetadata(file);
  if (cleaned && !await filesEqual(file, cleaned)) result[`${ext.toUpperCase()}.cleaner-targeted container metadata`] = "detected";
  return result;
}

async function filesEqual(left: Blob, right: Blob): Promise<boolean> {
  if (left.size !== right.size) return false;
  const [leftBytes, rightBytes] = await Promise.all([left.arrayBuffer(), right.arrayBuffer()]);
  const a = new Uint8Array(leftBytes);
  const b = new Uint8Array(rightBytes);
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

async function inspect(file: File, kind: FileKind | undefined): Promise<{ fields: Detected; limitations: string[]; format: string }> {
  const ext = file.name.split(".").pop()?.toUpperCase() ?? "UNKNOWN";
  if (kind === "jpeg" || kind === "image" || kind === "gif") {
    return { fields: await inspectImage(file), limitations: ["Detection is based on targeted JPEG markers, PNG/WebP chunks, and GIF extension blocks; metadata stored in unsupported private blocks may not be listed."], format: ext };
  }
  if (kind === "pdf") return { fields: await inspectPdf(file), limitations: ["The comparison checks standard PDF document-info keys visible in the file bytes; embedded-object metadata is not inspected."], format: ext };
  if (kind === "docx") return { fields: await inspectDocx(file), limitations: ["The comparison checks DOCX core, application, and custom property parts; metadata inside embedded documents is not inspected."], format: ext };
  if (kind === "container") return { fields: await inspectContainer(file), limitations: ["Audio/video detection compares the file with its matching local container cleaner, so findings correspond to structures that cleaner changes; untouched codec-private/vendor data is outside this comparison."], format: ext };
  return { fields: {}, limitations: ["This file type is not supported by the browser comparison reader."], format: ext };
}

function toFields(original: Detected, cleaned: Detected): { all: MetadataField[]; removed: MetadataField[]; preserved: MetadataField[] } {
  const names = [...new Set([...Object.keys(original), ...Object.keys(cleaned)])].sort();
  const all = names.map((name) => {
    const originalValue = original[name];
    const cleanedValue = cleaned[name];
    const status: MetadataStatus = originalValue && !cleanedValue ? "removed" : originalValue && cleanedValue ? "present" : "not-detected";
    return { name, original: originalValue, cleaned: cleanedValue, status };
  });
  return { all, removed: all.filter((field) => field.status === "removed"), preserved: all.filter((field) => field.status === "present") };
}

export async function compareMetadata(original: File, cleaned: File): Promise<MetadataComparison> {
  const kind = getKindForFilename(original.name);
  const [before, after] = await Promise.all([inspect(original, kind), inspect(cleaned, kind)]);
  const fieldSets = toFields(before.fields, after.fields);
  return {
    originalFilename: original.name,
    cleanedFilename: cleaned.name,
    format: before.format,
    detectedOriginalFields: fieldSets.all.filter((field) => field.original),
    detectedCleanedFields: fieldSets.all.filter((field) => field.cleaned),
    removedFields: fieldSets.removed,
    preservedFields: fieldSets.preserved,
    limitations: [...new Set([...before.limitations, ...after.limitations])],
    generatedAt: new Date().toISOString(),
  };
}
