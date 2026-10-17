import sharp from "sharp";

/** PDFs embed RGB JPEGs; flatten PNG/SVG transparency onto the white paper. */
export async function pdfLogoJpeg(buffer: Buffer) {
  return sharp(buffer, {limitInputPixels: 20_000_000})
    .rotate().resize({width:640,height:240,fit:"inside",withoutEnlargement:true})
    .flatten({background:"#ffffff"}).toColourspace("srgb").jpeg({quality:90}).toBuffer();
}
