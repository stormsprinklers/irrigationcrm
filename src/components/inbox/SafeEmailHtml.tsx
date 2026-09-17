"use client";

import { useEffect, useState } from "react";

const CONTENT_TAGS = new Set([
  "a", "b", "blockquote", "br", "code", "dd", "div", "dl", "dt", "em",
  "h1", "h2", "h3", "h4", "h5", "h6", "hr", "i", "img", "li", "ol",
  "p", "pre", "s", "small", "span", "strong", "sub", "sup", "table",
  "tbody", "td", "th", "thead", "tr", "u", "ul",
]);
const REMOVE_TAGS = new Set([
  "base", "embed", "form", "iframe", "input", "link", "math", "meta",
  "object", "script", "style", "svg", "template", "textarea", "video",
]);

function safeUrl(value: string, allowed: string[]) {
  try {
    const url = new URL(value.trim());
    return allowed.includes(url.protocol) ? url.href : null;
  } catch {
    return null;
  }
}

function sanitizeHtml(html: string) {
  const document = new DOMParser().parseFromString(html, "text/html");
  function clean(parent: Element) {
    for (const child of Array.from(parent.children)) {
      const tag = child.tagName.toLowerCase();
      if (REMOVE_TAGS.has(tag)) {
        child.remove();
        continue;
      }
      clean(child);
      if (!CONTENT_TAGS.has(tag)) {
        child.replaceWith(...Array.from(child.childNodes));
        continue;
      }
      const href = tag === "a" ? safeUrl(child.getAttribute("href") ?? "", ["https:", "http:", "mailto:", "tel:"]) : null;
      const src = tag === "img" ? safeUrl(child.getAttribute("src") ?? "", ["https:", "http:"]) : null;
      const alt = tag === "img" ? child.getAttribute("alt") : null;
      for (const attribute of Array.from(child.attributes)) child.removeAttribute(attribute.name);
      if (href) {
        child.setAttribute("href", href);
        child.setAttribute("target", "_blank");
        child.setAttribute("rel", "noopener noreferrer");
      }
      if (src) child.setAttribute("src", src);
      if (alt) child.setAttribute("alt", alt);
      if (tag === "img" && !src) child.remove();
    }
  }
  clean(document.body);
  return document.body.innerHTML;
}

export function SafeEmailHtml({ html, className }: { html: string; className?: string }) {
  const [sanitized, setSanitized] = useState({ source: "", value: "" });
  useEffect(() => setSanitized({ source: html, value: sanitizeHtml(html) }), [html]);
  return <div className={className} dangerouslySetInnerHTML={{ __html: sanitized.source === html ? sanitized.value : "" }} />;
}
