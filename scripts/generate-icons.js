#!/usr/bin/env node
/**
 * Generate PNG icons from public/favicon.svg for Safari, bookmarks, etc.
 * Run: node scripts/generate-icons.js
 */
const sharp = require("sharp");
const path = require("path");
const fs = require("fs");

const publicDir = path.join(__dirname, "..", "public");
const svgPath = path.join(publicDir, "favicon.svg");

if (!fs.existsSync(svgPath)) {
  console.error("Missing public/favicon.svg");
  process.exit(1);
}

const sizes = [
  { size: 180, name: "apple-icon.png" },
  { size: 32, name: "icon-32.png" },
];

async function generate() {
  const buffer = fs.readFileSync(svgPath);
  for (const { size, name } of sizes) {
    await sharp(buffer)
      .resize(size, size)
      .png()
      .toFile(path.join(publicDir, name));
    console.log(`Generated public/${name} (${size}x${size})`);
  }
}

generate().catch((err) => {
  console.error(err);
  process.exit(1);
});
