"use client";

import { useEffect, useRef, useState } from "react";
import { Bold, Italic, Link2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

type Props = {
  html: string;
  mobilePreview: boolean;
  onHtmlChange: (html: string) => void;
  className?: string;
};

const EDITOR_SCRIPT = `
(function() {
  if (window.__emailEditorReady) return;
  window.__emailEditorReady = true;

  function editableTargets() {
    return Array.from(document.querySelectorAll('p,h1,h2,h3,h4,h5,h6,li,td,th,span,div,a'));
  }

  function enableEditing() {
    editableTargets().forEach(function(el) {
      if (el.closest('script') || el.tagName === 'SCRIPT') return;
      if (el.tagName === 'TABLE' || el.tagName === 'TBODY' || el.tagName === 'TR') return;
      if (el.tagName === 'A') {
        el.setAttribute('contenteditable', 'true');
        el.addEventListener('click', function(e) {
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

  document.addEventListener('input', notify);
  document.addEventListener('keyup', notify);
  document.addEventListener('mouseup', function() {
    var sel = window.getSelection();
    window.parent.postMessage({
      type: 'email-editor-selection',
      hasSelection: !!(sel && !sel.isCollapsed)
    }, '*');
  });

  window.addEventListener('message', function(event) {
    var data = event.data || {};
    if (data.type === 'email-editor-command') {
      try {
        if (data.command === 'fontName') {
          document.execCommand('fontName', false, data.value);
        } else if (data.command === 'fontSize') {
          document.execCommand('fontSize', false, data.value);
        } else if (data.command === 'setLink') {
          var a = document.querySelector('a[data-editing-link="1"]') || document.activeElement;
          if (a && a.tagName === 'A') {
            a.setAttribute('href', data.href || '#');
            a.removeAttribute('data-editing-link');
          } else {
            document.execCommand('createLink', false, data.href || '#');
          }
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

  var style = document.createElement('style');
  style.setAttribute('data-email-editor', '1');
  style.textContent = '[contenteditable="true"]{outline:1px dashed transparent;}[contenteditable="true"]:hover{outline-color:#94a3b8;}[contenteditable="true"]:focus{outline-color:#4C9BC8;outline-width:2px;}a[contenteditable="true"]{cursor:text;}';
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

export function EditableEmailPreview({ html, mobilePreview, onHtmlChange, className }: Props) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const applyingRef = useRef(false);
  const [linkDialog, setLinkDialog] = useState<{ href: string; text: string } | null>(null);
  const [linkHref, setLinkHref] = useState("");
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
      if (data.type === "email-editor-link") {
        setLinkHref(String(data.href ?? ""));
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
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [onHtmlChange]);

  function sendCommand(command: string, value?: string) {
    iframeRef.current?.contentWindow?.postMessage(
      { type: "email-editor-command", command, value },
      "*"
    );
    iframeRef.current?.contentWindow?.focus();
  }

  function saveLink() {
    iframeRef.current?.contentWindow?.postMessage(
      { type: "email-editor-command", command: "setLink", href: linkHref.trim() || "#" },
      "*"
    );
    setLinkDialog(null);
  }

  return (
    <div className={cn("flex flex-1 flex-col", className)}>
      <div className="flex flex-wrap items-center gap-1 border-b px-3 py-2">
        <Button type="button" size="sm" variant="outline" onClick={() => sendCommand("bold")}>
          <Bold className="h-3.5 w-3.5" />
        </Button>
        <Button type="button" size="sm" variant="outline" onClick={() => sendCommand("italic")}>
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
            setLinkHref("https://");
            setLinkDialog({ href: "https://", text: "" });
          }}
        >
          <Link2 className="mr-1 h-3.5 w-3.5" />
          Link
        </Button>
        <span className="ml-auto text-xs text-muted-foreground">
          Click text to edit · click a link to change its URL
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

      {linkDialog ? (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-lg border bg-white p-4 shadow-lg">
            <h3 className="text-sm font-semibold">Edit link URL</h3>
            {linkDialog.text ? (
              <p className="mt-1 text-xs text-muted-foreground">Link text: {linkDialog.text}</p>
            ) : null}
            <Input
              className="mt-3"
              value={linkHref}
              onChange={(e) => setLinkHref(e.target.value)}
              placeholder="https://"
              autoFocus
            />
            <div className="mt-4 flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setLinkDialog(null)}>
                Cancel
              </Button>
              <Button type="button" onClick={saveLink}>
                Save link
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function emptyPreview() {
  return `<!DOCTYPE html><html><body style="font-family:Arial,sans-serif;padding:24px;color:#6b7280">Select a template to start, or paste HTML below.</body></html>`;
}
