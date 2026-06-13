"use client";

import { cn } from "@/lib/utils";

const folders = [
  { id: "INBOX", label: "Inbox" },
  { id: "SENT", label: "Sent" },
  { id: "DRAFT", label: "Drafts" },
  { id: "ARCHIVE", label: "Archive" },
  { id: "SPAM", label: "Spam" },
  { id: "TRASH", label: "Trash" },
] as const;

export function EmailFolderNav({
  active,
  onChange,
}: {
  active: string;
  onChange: (folder: string) => void;
}) {
  return (
    <div className="border-b border-border px-2 py-2">
      <div className="flex flex-wrap gap-1">
        {folders.map((folder) => (
          <button
            key={folder.id}
            type="button"
            onClick={() => onChange(folder.id)}
            className={cn(
              "rounded-md px-2 py-1 text-xs font-medium transition-colors",
              active === folder.id
                ? "bg-primary text-white"
                : "text-muted-foreground hover:bg-muted"
            )}
          >
            {folder.label}
          </button>
        ))}
      </div>
    </div>
  );
}
