import sharp from "sharp";

const image = (bytes: Buffer) => sharp(bytes, {limitInputPixels: 20_000_000});

/** The colored guide is used only to derive a mask. It is never sent to the image model. */
export async function preparePreviewLayers(clean: Buffer, marked: Buffer, suppliedMask?: Buffer) {
  const normalized = await image(clean).rotate().resize({width:1536,height:1536,fit:"inside",withoutEnlargement:true}).toColourspace("srgb").removeAlpha().png().toBuffer();
  const {width, height} = await image(normalized).metadata();
  if (!width || !height) throw new Error("Could not read the property photo");
  let mask: Buffer;
  if (suppliedMask) {
    const dimensions = await image(suppliedMask).metadata();
    const original = await image(clean).rotate().metadata();
    if (dimensions.width !== original.width || dimensions.height !== original.height || !dimensions.hasAlpha) throw new Error("The edit mask must match the property photo and contain transparency");
    mask = await image(suppliedMask).resize(width,height).ensureAlpha().png().toBuffer();
  } else {
    const base = await image(normalized).raw().toBuffer();
    const guide = await image(marked).rotate().resize(width,height).toColourspace("srgb").removeAlpha().raw().toBuffer();
    const pixels = Buffer.alloc(width*height*4,255);
    for(let i=0;i<width*height;i++) {
      const delta = Math.max(...[0,1,2].map(c=>Math.abs(base[i*3+c]-guide[i*3+c])));
      pixels[i*4+3] = delta > 35 ? 0 : 255;
    }
    mask = await sharp(pixels,{raw:{width,height,channels:4}}).png().toBuffer();
  }
  const alpha = await image(mask).extractChannel(3).raw().toBuffer();
  if (!alpha.some(value=>value<128)) throw new Error("Paint where the lights should go before generating a preview");
  const stats = await image(normalized).stats();
  const brightness = stats.channels.slice(0,3).reduce((sum,c)=>sum+c.mean,0)/3;
  // Keep the original geometry. A shared, unlit background makes erasing seamless.
  const background = await image(normalized).modulate({brightness:brightness>105?0.62:1,saturation:0.9}).png().toBuffer();
  return {background, mask, width, height};
}

/** Clip generated pixels to the allowed regions so unpainted areas stay exactly unchanged. */
export async function separatePreviewLights(background: Buffer, generated: Buffer, mask: Buffer) {
  const {width,height} = await image(background).metadata();
  if (!width || !height) throw new Error("Invalid preview background");
  const base = await image(background).removeAlpha().raw().toBuffer();
  const pixels = await image(generated).resize(width,height,{fit:"fill"}).toColourspace("srgb").ensureAlpha().raw().toBuffer();
  const maskAlpha = await image(mask).resize(width,height).extractChannel(3).raw().toBuffer();
  for(let i=0;i<width*height;i++) {
    const delta = Math.max(...[0,1,2].map(c=>Math.abs(base[i*3+c]-pixels[i*4+c])));
    pixels[i*4+3] = delta < 5 ? 0 : 255-maskAlpha[i];
  }
  const lights = await sharp(pixels,{raw:{width,height,channels:4}}).png().toBuffer();
  const composite = await image(background).composite([{input:lights}]).png().toBuffer();
  return {lights, composite};
}
