#!/usr/bin/env node
/**
 * Generate PNG and ICO icons from public/favicon.svg for Safari, bookmarks, etc.
 * Run: node scripts/generate-icons.js
 */
const sharp = require("sharp");
const path = require("path");
const fs = require("fs");

const publicDir = path.join(__dirname, "..", "public");
const svgPath = path.join(publicDir, "favicon.svg");
const icoPath = path.join(__dirname, "..", "src", "app", "favicon.ico");

/** The favicon tile colour. iOS rounds home-screen icons itself, so the Apple icon is a full square in this colour. */
const TILE_BACKGROUND = "#F1F3F7";

if (!fs.existsSync(svgPath)) {
  console.error("Missing public/favicon.svg");
  process.exit(1);
}

const sizes = [
  { size: 180, name: "apple-icon.png", flatten: true },
  { size: 32, name: "icon-32.png" },
];

const ICO_SIZES = [16, 32, 48];

/** ICO container holding PNG images, which every current browser accepts. */
function buildIco(pngs) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(pngs.length, 4);
  const entries = [];
  let offset = 6 + 16 * pngs.length;
  for (const { size, data } of pngs) {
    const entry = Buffer.alloc(16);
    entry.writeUInt8(size >= 256 ? 0 : size, 0);
    entry.writeUInt8(size >= 256 ? 0 : size, 1);
    entry.writeUInt16LE(1, 4);
    entry.writeUInt16LE(32, 6);
    entry.writeUInt32LE(data.length, 8);
    entry.writeUInt32LE(offset, 12);
    entries.push(entry);
    offset += data.length;
  }
  return Buffer.concat([header, ...entries, ...pngs.map((p) => p.data)]);
}

async function generate() {
  const buffer = fs.readFileSync(svgPath);
  for (const { size, name, flatten } of sizes) {
    let image = sharp(buffer).resize(size, size);
    if (flatten) image = image.flatten({ background: TILE_BACKGROUND });
    await image.png().toFile(path.join(publicDir, name));
    console.log(`Generated public/${name} (${size}x${size})`);
  }

  const pngs = await Promise.all(
    ICO_SIZES.map(async (size) => ({ size, data: await sharp(buffer).resize(size, size).png().toBuffer() }))
  );
  fs.writeFileSync(icoPath, buildIco(pngs));
  console.log(`Generated src/app/favicon.ico (${ICO_SIZES.join(", ")})`);
}

generate().catch((err) => {
  console.error(err);
  process.exit(1);
});
