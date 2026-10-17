import test from "node:test";
import assert from "node:assert/strict";
import sharp from "sharp";
import { pdfLogoJpeg } from "./logo";
import { jpegDimensions, SimplePdf } from "./layout-pdf";

test("transparent PNG company logos become embeddable JPEGs",async()=>{
  const png = await sharp({create:{width:100,height:100,channels:4,background:{r:25,g:80,b:45,alpha:0.5}}}).png().toBuffer();
  const logo = await pdfLogoJpeg(png);
  assert.deepEqual(jpegDimensions(logo),{width:100,height:100});
  const pdf = new SimplePdf("#19502d");
  assert.equal(pdf.addJpeg(logo,undefined,{width:160,height:64}),true);
  assert.match(pdf.toBuffer().toString(),/\/Subtype \/Image/);
});
