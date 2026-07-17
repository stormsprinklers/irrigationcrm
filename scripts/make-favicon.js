const sharp = require("sharp");
const path = require("path");
const fs = require("fs");

const src = path.join(__dirname, "..", "assets", "pwa-icon-source.png");
const outDir = path.join(__dirname, "..", "public");

async function main() {
  if (!fs.existsSync(src)) {
    throw new Error(`Source image not found: ${src}`);
  }
  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
  }

  const meta = await sharp(src).metadata();
  console.log("source", meta.width, meta.height, meta.format);

  const sizes = [
    { name: "favicon-16.png", size: 16 },
    { name: "icon.png", size: 32 },
    { name: "favicon.png", size: 32 },
    { name: "icon-192.png", size: 192 },
    { name: "icon-512.png", size: 512 },
    { name: "apple-icon.png", size: 180 },
  ];

  for (const { name, size } of sizes) {
    await sharp(src)
      .resize(size, size, { fit: "cover", position: "centre" })
      .png()
      .toFile(path.join(outDir, name));
    console.log("wrote", name, size);
  }

  // Browsers accept a PNG written as favicon.ico for basic tab icons.
  await sharp(src)
    .resize(32, 32, { fit: "cover", position: "centre" })
    .png()
    .toFile(path.join(outDir, "favicon.ico"));
  console.log("wrote favicon.ico");

  console.log("done");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
