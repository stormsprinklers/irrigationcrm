/** Multi-page Helvetica PDF with optional JPEG images (no extra npm deps). */

const PAGE_W = 612;
const PAGE_H = 792;
const MARGIN = 48;

type JpegImage = { bytes: Buffer; width: number; height: number };

function pdfEscape(text: string) {
  return ascii(text)
    .replace(/\\/g, "\\\\")
    .replace(/\(/g, "\\(")
    .replace(/\)/g, "\\)");
}

function ascii(text: string) {
  return text
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/\u2013|\u2014/g, "-")
    .replace(/\u00A0/g, " ")
    .replace(/[^\x20-\x7E\n]/g, "?");
}

function wrapLine(text: string, maxChars: number) {
  const words = ascii(text).split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (next.length <= maxChars) {
      current = next;
    } else {
      if (current) lines.push(current);
      current = word.length > maxChars ? word.slice(0, maxChars) : word;
    }
  }
  if (current) lines.push(current);
  return lines.length ? lines : [""];
}

export function jpegDimensions(bytes: Buffer): { width: number; height: number } | null {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return null;
  let i = 2;
  while (i + 9 < bytes.length) {
    if (bytes[i] !== 0xff) return null;
    const marker = bytes[i + 1];
    const length = bytes.readUInt16BE(i + 2);
    if (marker === 0xc0 || marker === 0xc1 || marker === 0xc2) {
      return {
        height: bytes.readUInt16BE(i + 5),
        width: bytes.readUInt16BE(i + 7),
      };
    }
    i += 2 + length;
  }
  return null;
}

function rgb(hex: string | null | undefined) {
  const raw = hex?.replace("#", "") ?? "";
  if (!/^[0-9a-fA-F]{6}$/.test(raw)) return { r: 0.06, g: 0.15, b: 0.27 };
  return {
    r: parseInt(raw.slice(0, 2), 16) / 255,
    g: parseInt(raw.slice(2, 4), 16) / 255,
    b: parseInt(raw.slice(4, 6), 16) / 255,
  };
}

type PageContent = { ops: string[]; images: JpegImage[] };

export class SimplePdf {
  private pages: PageContent[] = [{ ops: [], images: [] }];
  private y = PAGE_H - MARGIN;
  private readonly color: { r: number; g: number; b: number };

  constructor(brandHex?: string | null) {
    this.color = rgb(brandHex);
  }

  private page() {
    return this.pages[this.pages.length - 1]!;
  }

  private newPage() {
    this.pages.push({ ops: [], images: [] });
    this.y = PAGE_H - MARGIN;
  }

  private ensure(height: number) {
    if (this.y - height < MARGIN) this.newPage();
  }

  addHeading(text: string) {
    this.ensure(28);
    const { r, g, b } = this.color;
    this.page().ops.push(
      "BT",
      `/F1 18 Tf`,
      `${r.toFixed(3)} ${g.toFixed(3)} ${b.toFixed(3)} rg`,
      `1 0 0 1 ${MARGIN} ${this.y - 16} Tm`,
      `(${pdfEscape(text)}) Tj`,
      "ET"
    );
    this.y -= 28;
  }

  addSubheading(text: string) {
    this.ensure(20);
    this.page().ops.push(
      "BT",
      `/F1 12 Tf`,
      "0 0 0 rg",
      `1 0 0 1 ${MARGIN} ${this.y - 12} Tm`,
      `(${pdfEscape(text)}) Tj`,
      "ET"
    );
    this.y -= 20;
  }

  addMuted(text: string) {
    for (const line of wrapLine(text, 92)) {
      this.ensure(14);
      this.page().ops.push(
        "BT",
        `/F1 9 Tf`,
        "0.35 0.4 0.45 rg",
        `1 0 0 1 ${MARGIN} ${this.y - 10} Tm`,
        `(${pdfEscape(line)}) Tj`,
        "ET"
      );
      this.y -= 13;
    }
  }

  addBody(text: string) {
    for (const paragraph of ascii(text).split(/\n+/)) {
      for (const line of wrapLine(paragraph, 88)) {
        this.ensure(14);
        this.page().ops.push(
          "BT",
          `/F1 10 Tf`,
          "0.07 0.09 0.12 rg",
          `1 0 0 1 ${MARGIN} ${this.y - 11} Tm`,
          `(${pdfEscape(line)}) Tj`,
          "ET"
        );
        this.y -= 14;
      }
      this.y -= 4;
    }
  }

  addRule() {
    this.ensure(12);
    this.page().ops.push(
      `${this.color.r.toFixed(3)} ${this.color.g.toFixed(3)} ${this.color.b.toFixed(3)} RG`,
      "0.8 w",
      `${MARGIN} ${this.y} m ${PAGE_W - MARGIN} ${this.y} l S`
    );
    this.y -= 14;
  }

  addRow(left: string, right: string, bold = false) {
    this.ensure(16);
    const size = bold ? 11 : 10;
    this.page().ops.push(
      "BT",
      `/F1 ${size} Tf`,
      "0.07 0.09 0.12 rg",
      `1 0 0 1 ${MARGIN} ${this.y - 11} Tm`,
      `(${pdfEscape(left.slice(0, 70))}) Tj`,
      `1 0 0 1 ${PAGE_W - MARGIN - 90} ${this.y - 11} Tm`,
      `(${pdfEscape(right.slice(0, 18))}) Tj`,
      "ET"
    );
    this.y -= 16;
  }

  addJpeg(bytes: Buffer, caption?: string) {
    const dim = jpegDimensions(bytes);
    if (!dim) return false;
    const maxW = PAGE_W - MARGIN * 2;
    const scale = Math.min(1, maxW / dim.width, 220 / dim.height);
    const w = dim.width * scale;
    const h = dim.height * scale;
    this.ensure(h + 18);
    const nameIndex = this.page().images.length + 1;
    this.page().images.push({ bytes, width: dim.width, height: dim.height });
    const x = MARGIN;
    const y = this.y - h;
    this.page().ops.push(
      "q",
      `${w.toFixed(2)} 0 0 ${h.toFixed(2)} ${x} ${y} cm`,
      `/Im${nameIndex} Do`,
      "Q"
    );
    this.y = y - 8;
    if (caption) this.addMuted(caption);
    return true;
  }

  toBuffer() {
    type Obj = { id: number; bytes: Buffer };
    const objs: Obj[] = [];
    const push = (bytes: Buffer) => {
      const id = objs.length + 1;
      objs.push({ id, bytes });
      return id;
    };
    const pushText = (body: string) =>
      push(Buffer.from(`${objs.length + 1} 0 obj\n${body}\nendobj\n`, "utf8"));

    const fontId = pushText("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");
    const pageIds: number[] = [];
    const pageBodies: Array<{ id: number; body: string }> = [];

    for (const page of this.pages) {
      const localNames: string[] = [];
      page.images.forEach((img, idx) => {
        const header =
          `${objs.length + 1} 0 obj\n` +
          `<< /Type /XObject /Subtype /Image /Width ${img.width} /Height ${img.height} ` +
          `/ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${img.bytes.length} >>\nstream\n`;
        const id = push(
          Buffer.concat([
            Buffer.from(header, "utf8"),
            img.bytes,
            Buffer.from("\nendstream\nendobj\n", "utf8"),
          ])
        );
        localNames.push(`/Im${idx + 1} ${id} 0 R`);
      });

      const stream = page.ops.join("\n");
      const streamLen = Buffer.byteLength(stream, "utf8");
      const contentsId = pushText(`<< /Length ${streamLen} >>\nstream\n${stream}\nendstream`);
      const resources =
        `<< /Font << /F1 ${fontId} 0 R >>` +
        (localNames.length ? ` /XObject << ${localNames.join(" ")} >>` : "") +
        ` >>`;
      const pageBody =
        `<< /Type /Page /Parent __PAGES__ 0 R /MediaBox [0 0 ${PAGE_W} ${PAGE_H}] ` +
        `/Contents ${contentsId} 0 R /Resources ${resources} >>`;
      const pageId = objs.length + 1;
      pageBodies.push({ id: pageId, body: pageBody });
      pushText(pageBody);
      pageIds.push(pageId);
    }

    const pagesId = pushText(
      `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${pageIds.length} >>`
    );
    const catalogId = pushText(`<< /Type /Catalog /Pages ${pagesId} 0 R >>`);

    for (const page of pageBodies) {
      const obj = objs[page.id - 1]!;
      obj.bytes = Buffer.from(
        `${page.id} 0 obj\n${page.body.replace("__PAGES__", String(pagesId))}\nendobj\n`,
        "utf8"
      );
    }

    const header = Buffer.from("%PDF-1.4\n", "utf8");
    const parts: Buffer[] = [header];
    const offsets = [0];
    let cursor = header.length;
    for (const obj of objs) {
      offsets.push(cursor);
      parts.push(obj.bytes);
      cursor += obj.bytes.length;
    }
    let xref = `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n`;
    for (let i = 1; i <= objs.length; i++) {
      xref += `${String(offsets[i]).padStart(10, "0")} 00000 n \n`;
    }
    xref += `trailer<< /Size ${objs.length + 1} /Root ${catalogId} 0 R >>\nstartxref\n${cursor}\n%%EOF`;
    parts.push(Buffer.from(xref, "utf8"));
    return Buffer.concat(parts);
  }
}

export function money(value: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(value);
}

export function formatCompanyAddress(company: {
  address?: string | null;
  city?: string | null;
  state?: string | null;
  zip?: string | null;
}) {
  const line1 = company.address?.trim() ?? "";
  const line2 = [company.city, company.state].filter(Boolean).join(", ");
  const cityStateZip = [line2, company.zip].filter(Boolean).join(" ");
  return [line1, cityStateZip].filter(Boolean).join(" · ");
}
