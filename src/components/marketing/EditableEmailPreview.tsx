"use client";

import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import { Bold, Italic, Link2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MergeTokenFallbackEditor } from "@/components/communications/MergeTokenFallbackEditor";
import { formatMergeToken, mergeTokenKeyFromInsert, type ParsedMergeToken } from "@/lib/notifications/merge-tokens";
import { sanitizeEmailHref } from "@/lib/marketing/email-href";
import { cn } from "@/lib/utils";

type Props = {
  html: string;
  mobilePreview: boolean;
  onHtmlChange: (html: string) => void;
  className?: string;
  onFocusEditor?: () => void;
};

export type EditableEmailPreviewHandle = {
  insertText: (text: string) => void;
  insertMergeToken: (token: string) => void;
};

const EDITOR_SCRIPT = `
(function() {
  if (window.__emailEditorReady) return;
  window.__emailEditorReady = true;

  var MERGE_RE = /\\{([a-z_]+)(?:\\|([^}]*))?\\}/g;

  function escapeAttr(s) {
    return String(s).replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;');
  }

  function mergeChipHtml(key, fallback) {
    var inner = fallback ? '{' + key + '|' + fallback + '}' : '{' + key + '}';
    return '<span data-merge-token="' + escapeAttr(key) + '" data-merge-fallback="' + escapeAttr(fallback || '') + '" contenteditable="false" class="merge-token">' + escapeAttr(inner) + '</span>';
  }

  function wrapMergeTokens(root) {
    var walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null);
    var nodes = [];
    while (walker.nextNode()) {
      var node = walker.currentNode;
      var parent = node.parentElement;
      if (!parent) continue;
      if (parent.closest('[data-merge-token], script, style')) continue;
      MERGE_RE.lastIndex = 0;
      if (!node.nodeValue || !MERGE_RE.test(node.nodeValue)) continue;
      nodes.push(node);
    }
    nodes.forEach(function(textNode) {
      var text = textNode.nodeValue || '';
      var frag = document.createDocumentFragment();
      var last = 0;
      var m;
      MERGE_RE.lastIndex = 0;
      while ((m = MERGE_RE.exec(text))) {
        if (m.index > last) frag.appendChild(document.createTextNode(text.slice(last, m.index)));
        var span = document.createElement('span');
        span.setAttribute('data-merge-token', m[1]);
        span.setAttribute('data-merge-fallback', m[2] || '');
        span.setAttribute('contenteditable', 'false');
        span.className = 'merge-token';
        span.textContent = m[0];
        frag.appendChild(span);
        last = m.index + m[0].length;
      }
      if (last < text.length) frag.appendChild(document.createTextNode(text.slice(last)));
      if (textNode.parentNode) textNode.parentNode.replaceChild(frag, textNode);
    });
  }

  function editableTargets() {
    return Array.from(document.querySelectorAll('p,h1,h2,h3,h4,h5,h6,li,td,th,span,div,a'));
  }

  function enableEditing() {
    editableTargets().forEach(function(el) {
      if (el.closest('script') || el.tagName === 'SCRIPT') return;
      if (el.tagName === 'TABLE' || el.tagName === 'TBODY' || el.tagName === 'TR') return;
      if (el.closest('[data-merge-token]')) return;
      if (el.tagName === 'A') {
        el.setAttribute('contenteditable', 'true');
        el.addEventListener('click', function(e) {
          if (e.target && e.target.closest && e.target.closest('[data-merge-token]')) return;
          e.preventDefault();
          e.stopPropagation();
          window.parent.postMessage({
            type: 'email-editor-link',
            href: el.getAttribute('href') || '',
            text: el.textContent || ''
          }, '*');
        });
        return;
      }
      if (el.tagName === 'IMG') return;
      // Skip layout tables wrappers that only hold structure
      if ((el.tagName === 'TD' || el.tagName === 'DIV') && el.querySelector('table,tr,td,img,h1,h2,h3,p,ul,ol')) {
        return;
      }
      el.setAttribute('contenteditable', 'true');
    });
    wrapMergeTokens(document.body);
  }

  function serialize() {
    var clone = document.documentElement.cloneNode(true);
    clone.querySelectorAll('[contenteditable]').forEach(function(n) {
      n.removeAttribute('contenteditable');
    });
    clone.querySelectorAll('script[data-email-editor]').forEach(function(n) { n.remove(); });
    clone.querySelectorAll('style[data-email-editor]').forEach(function(n) { n.remove(); });
    return '<!DOCTYPE html>\\n' + clone.outerHTML;
  }

  var notifyTimer = null;
  function notify() {
    clearTimeout(notifyTimer);
    notifyTimer = setTimeout(function() {
      window.parent.postMessage({ type: 'email-editor-html', html: serialize() }, '*');
    }, 200);
  }

  var savedRange = null;
  var lastEditable = null;

  function saveSelection() {
    var sel = window.getSelection();
    if (!sel || sel.rangeCount === 0 || !sel.anchorNode || !document.contains(sel.anchorNode)) return;
    try {
      savedRange = sel.getRangeAt(0).cloneRange();
    } catch (err) {}
  }

  function restoreSelection() {
    if (!savedRange) return false;
    try {
      var node = savedRange.commonAncestorContainer;
      var el = node.nodeType === 1 ? node : node.parentElement;
      var editable = el && el.closest ? el.closest('[contenteditable="true"]') : null;
      if (editable) {
        lastEditable = editable;
        editable.focus();
      }
      var sel = window.getSelection();
      if (!sel) return false;
      sel.removeAllRanges();
      sel.addRange(savedRange);
      return true;
    } catch (err) {
      savedRange = null;
      return false;
    }
  }

  function ensureCaret() {
    if (restoreSelection()) return;
    var target = lastEditable || document.querySelector('[contenteditable="true"]');
    if (!target) return;
    target.focus();
    var range = document.createRange();
    range.selectNodeContents(target);
    range.collapse(false);
    var sel = window.getSelection();
    if (!sel) return;
    sel.removeAllRanges();
    sel.addRange(range);
    savedRange = range.cloneRange();
  }

  document.addEventListener('input', notify);
  document.addEventListener('keyup', function() {
    saveSelection();
    notify();
  });
  document.addEventListener('selectionchange', saveSelection);
  document.addEventListener('focusout', saveSelection);
  document.addEventListener('focusin', function(e) {
    var t = e.target && e.target.closest ? e.target.closest('[contenteditable="true"]') : null;
    if (t) lastEditable = t;
    window.parent.postMessage({ type: 'email-editor-focus' }, '*');
  });
  document.addEventListener('mouseup', function() {
    saveSelection();
    var sel = window.getSelection();
    window.parent.postMessage({
      type: 'email-editor-selection',
      hasSelection: !!(sel && !sel.isCollapsed),
      text: sel ? String(sel.toString() || '') : ''
    }, '*');
  });

  window.addEventListener('message', function(event) {
    var data = event.data || {};
    if (data.type === 'email-editor-command') {
      try {
        if (data.command !== 'setMergeFallback' && data.command !== 'clearMergeEditing') {
          ensureCaret();
        }
        if (data.command === 'fontName') {
          document.execCommand('fontName', false, data.value);
        } else if (data.command === 'fontSize') {
          document.execCommand('fontSize', false, data.value);
        } else if (data.command === 'setLink') {
          var href = data.href || '#';
          var text = String(data.text || '').trim();
          var a = document.querySelector('a[data-editing-link="1"]');
          if (a && a.tagName === 'A') {
            a.setAttribute('href', href);
            if (text) a.textContent = text;
            a.removeAttribute('data-editing-link');
          } else {
            var sel = window.getSelection();
            if (text && (!sel || sel.isCollapsed)) {
              document.execCommand('insertHTML', false, '<a href="' + escapeAttr(href) + '">' + escapeAttr(text) + '</a>');
            } else {
              document.execCommand('createLink', false, href);
              if (text) {
                var node = sel && sel.anchorNode;
                var created = node && node.parentElement ? node.parentElement.closest('a') : null;
                if (created && text) created.textContent = text;
              }
            }
          }
        } else if (data.command === 'insertText') {
          document.execCommand('insertText', false, data.value || '');
        } else if (data.command === 'insertMergeToken') {
          document.execCommand('insertHTML', false, mergeChipHtml(data.value || '', ''));
          saveSelection();
        } else if (data.command === 'setMergeFallback') {
          var chip = document.querySelector('[data-editing-merge="1"]');
          if (chip) {
            var key = chip.getAttribute('data-merge-token') || '';
            var fb = data.fallback || '';
            chip.setAttribute('data-merge-fallback', fb);
            chip.textContent = fb ? '{' + key + '|' + fb + '}' : '{' + key + '}';
          }
        } else if (data.command === 'clearMergeEditing') {
          document.querySelectorAll('[data-editing-merge]').forEach(function(n) {
            n.removeAttribute('data-editing-merge');
          });
        } else {
          document.execCommand(data.command, false, data.value || null);
        }
        notify();
      } catch (e) {}
    }
    if (data.type === 'email-editor-mark-link') {
      document.querySelectorAll('a[data-editing-link]').forEach(function(n) {
        n.removeAttribute('data-editing-link');
      });
      var links = Array.from(document.querySelectorAll('a'));
      var match = links.find(function(l) {
        return (l.getAttribute('href') || '') === (data.href || '') &&
          (l.textContent || '') === (data.text || '');
      }) || links.find(function(l) {
        return (l.getAttribute('href') || '') === (data.href || '');
      });
      if (match) match.setAttribute('data-editing-link', '1');
    }
  });

  document.addEventListener('click', function(e) {
    var chip = e.target && e.target.closest ? e.target.closest('[data-merge-token]') : null;
    if (!chip) return;
    e.preventDefault();
    e.stopPropagation();
    document.querySelectorAll('[data-editing-merge]').forEach(function(n) {
      n.removeAttribute('data-editing-merge');
    });
    chip.setAttribute('data-editing-merge', '1');
    window.parent.postMessage({
      type: 'email-editor-merge-token',
      key: chip.getAttribute('data-merge-token') || '',
      fallback: chip.getAttribute('data-merge-fallback') || ''
    }, '*');
  }, true);

  var style = document.createElement('style');
  style.setAttribute('data-email-editor', '1');
  style.textContent = '[contenteditable="true"]{outline:1px dashed transparent;}[contenteditable="true"]:hover{outline-color:#94a3b8;}[contenteditable="true"]:focus{outline-color:#4C9BC8;outline-width:2px;}a[contenteditable="true"]{cursor:text;}.merge-token{background:#C2E4F0;color:#102341;border-radius:4px;padding:0 4px;cursor:pointer;white-space:nowrap;font:inherit;}.merge-token:hover{background:#4C9BC8;color:#fff;}[data-editing-merge="1"]{outline:2px solid #102341;}';
  document.head.appendChild(style);
  enableEditing();
  window.parent.postMessage({ type: 'email-editor-ready' }, '*');
})();
`;

function injectEditor(html: string): string {
  const script = `<script data-email-editor="1">${EDITOR_SCRIPT}</script>`;
  if (/<\/body>/i.test(html)) {
    return html.replace(/<\/body>/i, `${script}</body>`);
  }
  return `${html}${script}`;
}

export const EditableEmailPreview = forwardRef<EditableEmailPreviewHandle, Props>(
  function EditableEmailPreview(
    { html, mobilePreview, onHtmlChange, className, onFocusEditor },
    ref
  ) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const applyingRef = useRef(false);
  const [linkDialog, setLinkDialog] = useState<{ href: string; text: string } | null>(null);
  const [linkHref, setLinkHref] = useState("");
  const [linkText, setLinkText] = useState("");
  const lastSelectionText = useRef("");
  const [mergeToken, setMergeToken] = useState<ParsedMergeToken | null>(null);
  const [fontFamily, setFontFamily] = useState("Arial");
  const [fontSize, setFontSize] = useState("3");

  // Reload iframe when external html changes (template select / AI / HTML textarea),
  // but not when the change came from the iframe itself.
  useEffect(() => {
    if (applyingRef.current) {
      applyingRef.current = false;
      return;
    }
    const iframe = iframeRef.current;
    if (!iframe) return;
    iframe.srcdoc = injectEditor(html.trim() || emptyPreview());
  }, [html]);

  useEffect(() => {
    function onMessage(event: MessageEvent) {
      const data = event.data;
      if (!data || typeof data !== "object") return;
      if (data.type === "email-editor-html" && typeof data.html === "string") {
        applyingRef.current = true;
        onHtmlChange(data.html);
      }
      if (data.type === "email-editor-focus") {
        onFocusEditor?.();
      }
      if (data.type === "email-editor-selection") {
        lastSelectionText.current = String(data.text ?? "");
      }
      if (data.type === "email-editor-link") {
        setLinkHref(String(data.href ?? ""));
        setLinkText(String(data.text ?? "").trim() || "click here");
        setLinkDialog({ href: String(data.href ?? ""), text: String(data.text ?? "") });
        iframeRef.current?.contentWindow?.postMessage(
          {
            type: "email-editor-mark-link",
            href: data.href,
            text: data.text,
          },
          "*"
        );
      }
      if (data.type === "email-editor-merge-token") {
        const key = String(data.key ?? "");
        const fallback = String(data.fallback ?? "");
        if (!key) return;
        setMergeToken({
          raw: formatMergeToken(key, fallback),
          key,
          fallback,
          start: 0,
          end: 0,
        });
      }
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [onHtmlChange, onFocusEditor]);

  function sendCommand(command: string, value?: string) {
    iframeRef.current?.contentWindow?.postMessage(
      { type: "email-editor-command", command, value },
      "*"
    );
    iframeRef.current?.contentWindow?.focus();
  }

  useImperativeHandle(ref, () => ({
    insertText(text: string) {
      sendCommand("insertText", text);
    },
    insertMergeToken(token: string) {
      sendCommand("insertMergeToken", mergeTokenKeyFromInsert(token));
    },
  }));

  function saveLink() {
    const href = sanitizeEmailHref(linkHref) || "#";
    iframeRef.current?.contentWindow?.postMessage(
      {
        type: "email-editor-command",
        command: "setLink",
        href,
        text: linkText.trim() || "click here",
      },
      "*"
    );
    setLinkDialog(null);
  }

  return (
    <div className={cn("flex flex-1 flex-col", className)}>
      <div className="flex flex-wrap items-center gap-1 border-b px-3 py-2">
        <Button
          type="button"
          size="sm"
          variant="outline"
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => sendCommand("bold")}
        >
          <Bold className="h-3.5 w-3.5" />
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => sendCommand("italic")}
        >
          <Italic className="h-3.5 w-3.5" />
        </Button>
        <select
          className="h-8 rounded-md border border-input bg-background px-2 text-xs"
          value={fontFamily}
          onChange={(e) => {
            setFontFamily(e.target.value);
            sendCommand("fontName", e.target.value);
          }}
          aria-label="Font"
        >
          <option value="Arial">Arial</option>
          <option value="Helvetica">Helvetica</option>
          <option value="Georgia">Georgia</option>
          <option value="Times New Roman">Times New Roman</option>
          <option value="Verdana">Verdana</option>
          <option value="Trebuchet MS">Trebuchet MS</option>
        </select>
        <select
          className="h-8 rounded-md border border-input bg-background px-2 text-xs"
          value={fontSize}
          onChange={(e) => {
            setFontSize(e.target.value);
            sendCommand("fontSize", e.target.value);
          }}
          aria-label="Font size"
        >
          <option value="1">Small</option>
          <option value="2">Normal</option>
          <option value="3">Medium</option>
          <option value="4">Large</option>
          <option value="5">XL</option>
          <option value="6">XXL</option>
        </select>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => {
            const selected = lastSelectionText.current.trim();
            setLinkHref("https://");
            setLinkText(selected || "click here");
            setLinkDialog({ href: "https://", text: selected });
          }}
        >
          <Link2 className="mr-1 h-3.5 w-3.5" />
          Link
        </Button>
        <span className="ml-auto text-xs text-muted-foreground">
          Click text to edit · click a variable to set fallback text · click a link to change its URL
        </span>
      </div>

      <div className="flex flex-1 items-start justify-center overflow-auto bg-slate-100 p-4 sm:p-6">
        <div
          className={cn(
            "overflow-hidden rounded-lg border bg-white shadow-md transition-[width,max-width] duration-200",
            mobilePreview ? "w-full max-w-[375px]" : "w-full max-w-[640px]"
          )}
        >
          <iframe
            ref={iframeRef}
            title="Email preview"
            className="block h-[min(65vh,680px)] w-full bg-white"
            sandbox="allow-scripts allow-same-origin"
          />
        </div>
      </div>

      {mergeToken ? (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md">
            <MergeTokenFallbackEditor
              token={mergeToken}
              onFallbackChange={(fallback) => {
                iframeRef.current?.contentWindow?.postMessage(
                  { type: "email-editor-command", command: "setMergeFallback", fallback },
                  "*"
                );
              }}
              onClose={() => {
                iframeRef.current?.contentWindow?.postMessage(
                  { type: "email-editor-command", command: "clearMergeEditing" },
                  "*"
                );
                setMergeToken(null);
              }}
            />
          </div>
        </div>
      ) : null}

      {linkDialog ? (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-lg border bg-white p-4 shadow-lg">
            <h3 className="text-sm font-semibold">Insert link</h3>
            <label className="mt-3 block text-xs text-muted-foreground">Link text</label>
            <Input
              className="mt-1"
              value={linkText}
              onChange={(e) => setLinkText(e.target.value)}
              placeholder="click here"
              autoFocus
            />
            <label className="mt-3 block text-xs text-muted-foreground">URL</label>
            <Input
              className="mt-1"
              value={linkHref}
              onChange={(e) => setLinkHref(e.target.value)}
              placeholder="https://"
            />
            <div className="mt-4 flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setLinkDialog(null)}>
                Cancel
              </Button>
              <Button type="button" onClick={saveLink} disabled={!sanitizeEmailHref(linkHref)}>
                Save link
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
});

EditableEmailPreview.displayName = "EditableEmailPreview";

function emptyPreview() {
  return `<!DOCTYPE html><html><body style="font-family:Arial,sans-serif;padding:24px;color:#6b7280">Select a template to start, or paste HTML below.</body></html>`;
}
