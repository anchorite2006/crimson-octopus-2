import { readFileSync, writeFileSync, renameSync, mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";

const INPUT = "entry.png";
const MAX_BYTES = 1_048_576;

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const JPEG_SOI = Buffer.from([0xff, 0xd8]);

function pngDimensions(data: Buffer): { width: number; height: number } {
  if (data.length < 24) {
    throw new Error("PNG file too short to contain dimensions");
  }
  return {
    width: data.readUInt32BE(16),
    height: data.readUInt32BE(20),
  };
}

function jpegDimensions(data: Buffer): { width: number; height: number } {
  let offset = 2;
  while (offset + 1 < data.length) {
    // Skip padding bytes between markers.
    while (offset < data.length && data[offset] === 0xff) {
      offset++;
    }
    if (offset >= data.length) break;
    const marker = data[offset];
    offset++;

    // Standalone markers have no length field; skip them.
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd9)) {
      continue;
    }

    if (offset + 1 >= data.length) {
      throw new Error("JPEG truncated while reading segment length");
    }
    const length = data.readUInt16BE(offset);
    if (length < 2) {
      throw new Error("JPEG segment length is invalid");
    }

    const isSof =
      marker >= 0xc0 &&
      marker <= 0xcf &&
      marker !== 0xc4 &&
      marker !== 0xc8 &&
      marker !== 0xcc;
    if (isSof) {
      if (offset + 5 >= data.length) {
        throw new Error("JPEG Start Of Frame segment too short");
      }
      return {
        height: data.readUInt16BE(offset + 3),
        width: data.readUInt16BE(offset + 5),
      };
    }

    // Advance past this segment: length includes its own 2 length bytes.
    offset += length;
  }
  throw new Error("No Start Of Frame marker found in JPEG");
}

const data = readFileSync(INPUT);
if (data.length === 0) {
  throw new Error("entry.png is empty");
}
if (data.length > MAX_BYTES) {
  throw new Error(`entry.png is ${data.length} bytes, over the 1,048,576-byte limit`);
}

let format: string;
let dimensions: { width: number; height: number };
if (data.subarray(0, 8).equals(PNG_SIGNATURE)) {
  format = "PNG";
  dimensions = pngDimensions(data);
} else if (data.subarray(0, 2).equals(JPEG_SOI)) {
  format = "JPEG";
  dimensions = jpegDimensions(data);
} else {
  throw new Error("entry.png is neither PNG nor JPEG");
}

const outputDir = process.env.MAKEFUN_OUTPUT_DIR || "/output";
if (!existsSync(outputDir)) {
  mkdirSync(outputDir, { recursive: true });
}

const dest = join(outputDir, "entry.png");
const tmp = join(outputDir, `.entry.png.tmp-${process.pid}`);
writeFileSync(tmp, data);
renameSync(tmp, dest);

console.log(
  `Wrote ${data.length} bytes (${format}, ${dimensions.width}x${dimensions.height}) to ${dest}`
);
