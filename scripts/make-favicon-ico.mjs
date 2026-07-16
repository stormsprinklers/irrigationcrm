import pngToIco from "png-to-ico";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(__dirname, "..", "public");

const buf = await pngToIco([
  path.join(publicDir, "favicon-16.png"),
  path.join(publicDir, "icon.png"),
]);
fs.writeFileSync(path.join(publicDir, "favicon.ico"), buf);
console.log("wrote favicon.ico", buf.length);
