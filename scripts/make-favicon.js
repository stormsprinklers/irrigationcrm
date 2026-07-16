const sharp = require("sharp");
const path = require("path");
const fs = require("fs");

const src = path.join(
  process.env.USERPROFILE,
  ".cursor",
  "projects",
  "c-Users-jgree-OneDrive-Desktop-STORM-SPRINKLERS-APPS",
  "assets",
  "c__Users_jgree_AppData_Roaming_Cursor_User_workspaceStorage_3069cd118c90732aa7198774e2a10d9b_images_image-db6b63ff-c26d-4496-95d0-aed17fe952a0.png",
);
const outDir = path.join(__dirname, "..", "public");

function isNearWhite(r, g, b) {
  return r > 235 && g > 235 && b > 235;
}

async function main() {
  if (!fs.existsSync(src)) {
    throw new Error(`Source image not found: ${src}`);
  }
  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
  }

  const meta = await sharp(src).metadata();
  console.log("source", meta.width, meta.height, meta.format);

  const { data, info } = await sharp(src)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const w = info.width;
  const h = info.height;
  const visited = new Uint8Array(w * h);
  const stack = [
    [0, 0],
    [w - 1, 0],
    [0, h - 1],
    [w - 1, h - 1],
  ];

  while (stack.length) {
    const [x, y] = stack.pop();
    if (x < 0 || y < 0 || x >= w || y >= h) continue;
    const idx = y * w + x;
    if (visited[idx]) continue;
    visited[idx] = 1;
    const i = idx * 4;
    if (!isNearWhite(data[i], data[i + 1], data[i + 2])) continue;
    data[i + 3] = 0;
    stack.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]);
  }

  const transparent = await sharp(data, {
    raw: { width: w, height: h, channels: 4 },
  })
    .png()
    .toBuffer();

  const sizes = [
    { name: "favicon-16.png", size: 16 },
    { name: "icon.png", size: 32 },
    { name: "favicon.png", size: 32 },
    { name: "icon-192.png", size: 192 },
    { name: "apple-icon.png", size: 180 },
  ];

  for (const { name, size } of sizes) {
    await sharp(transparent)
      .resize(size, size, {
        fit: "contain",
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      })
      .png()
      .toFile(path.join(outDir, name));
    console.log("wrote", name, size);
  }

  console.log("done");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
