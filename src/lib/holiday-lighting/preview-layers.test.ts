import test from "node:test";
import assert from "node:assert/strict";
import sharp from "sharp";
import { preparePreviewLayers, separatePreviewLights } from "./preview-layers";

test("guide paint creates a mask without becoming part of the house or generated image", async () => {
  const clean = await sharp({create:{width:10,height:10,channels:3,background:"#aaaaaa"}}).png().toBuffer();
  const yellow = await sharp({create:{width:2,height:2,channels:3,background:"#ffb020"}}).png().toBuffer();
  const marked = await sharp(clean).composite([{input:yellow,left:4,top:4}]).png().toBuffer();
  const prepared = await preparePreviewLayers(clean,marked);
  const alpha = await sharp(prepared.mask).extractChannel(3).raw().toBuffer();
  assert.equal(alpha[0],255);
  assert.equal(alpha[4*10+4],0);
  const base = await sharp(prepared.background).raw().toBuffer();
  assert.deepEqual(base.subarray(0,3),base.subarray((4*10+4)*3,(4*10+4)*3+3));
  const generated = await sharp({create:{width:10,height:10,channels:3,background:"#ffffff"}}).png().toBuffer();
  const layers = await separatePreviewLights(prepared.background,generated,prepared.mask);
  const lights = await sharp(layers.lights).raw().toBuffer();
  assert.equal(lights[3],0);
  assert.equal(lights[(4*10+4)*4+3],255);
  const composite = await sharp(layers.composite).removeAlpha().raw().toBuffer();
  assert.deepEqual(composite.subarray(0,3),base.subarray(0,3));
  assert.deepEqual([...composite.subarray((4*10+4)*3,(4*10+4)*3+3)],[255,255,255]);
});

test("empty placement masks are rejected",async()=>{
  const clean = await sharp({create:{width:4,height:4,channels:3,background:"#aaaaaa"}}).png().toBuffer();
  await assert.rejects(preparePreviewLayers(clean,clean),/Paint where/);
});
