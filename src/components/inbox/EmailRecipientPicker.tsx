"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Search, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { CustomerTeamScope } from "@/lib/inbox/types";

export type EmailRecipient = {
  email: string;
  name: string;
  customerId?: string;
  userId?: string;
};

type ContactResult = {
  id: string;
  name: string;
  email: string | null;
  phone?: string | null;
  tags?: string[];
  role?: string;
};

const ROLE_LABELS: Record<string, string> = {
  ADMIN: "Admin",
  MANAGER: "Manager",
  CSR: "CSR",
  TECH: "Technician",
};

type Props = {
  scope: CustomerTeamScope;
  value: EmailRecipient[];
  onChange: (recipients: EmailRecipient[]) => void;
  className?: string;
};

export function EmailRecipientPicker({ scope, value, onChange, className }: Props) {
  const [search, setSearch] = useState("");
  const [tagFilter, setTagFilter] = useState("");
  const [roleFilter, setRoleFilter] = useState("");
  const [results, setResults] = useState<ContactResult[]>([]);
  const [availableTags, setAvailableTags] = useState<string[]>([]);
  const [availableRoles, setAvailableRoles] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);

  const apiScope = scope === "customers" ? "external" : "internal";
  const selectedEmails = useMemo(() => new Set(value.map((r) => r.email.toLowerCase())), [value]);

  const loadContacts = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ scope: apiScope });
      if (search.trim()) params.set("search", search.trim());
      if (tagFilter) params.set("tag", tagFilter);
      if (roleFilter) params.set("role", roleFilter);

      const res = await fetch(`/api/inbox/contacts?${params}`);
      if (!res.ok) return;
      const data = await res.json();
      const list: ContactResult[] =
        apiScope === "internal" ? (data.employees ?? []) : (data.customers ?? []);
      setResults(list.filter((item) => item.email));
      setAvailableTags(data.availableTags ?? []);
      setAvailableRoles(data.availableRoles ?? []);
    } finally {
      setLoading(false);
    }
  }, [apiScope, search, tagFilter, roleFilter]);

  useEffect(() => {
    const timer = setTimeout(loadContacts, 250);
    return () => clearTimeout(timer);
  }, [loadContacts]);

  function addRecipient(contact: ContactResult) {
    if (!contact.email || selectedEmails.has(contact.email.toLowerCase())) return;
    const next: EmailRecipient = {
      email: contact.email,
      name: contact.name,
      ...(apiScope === "external" ? { customerId: contact.id } : { userId: contact.id }),
    };
    onChange([...value, next]);
    setSearch("");
    setOpen(false);
  }

  function removeRecipient(email: string) {
    onChange(value.filter((r) => r.email !== email));
  }

  const activeFilter = tagFilter || roleFilter;

  return (
    <div className={cn("relative mb-2", className)}>
      {value.length > 0 ? (
        <div className="mb-2 flex flex-wrap gap-1.5">
          {value.map((recipient) => (
            <Badge key={recipient.email} variant="secondary" className="gap-1 pr-1">
              <span className="max-w-[180px] truncate">{recipient.name}</span>
              <button
                type="button"
                className="rounded p-0.5 hover:bg-muted"
                onClick={() => removeRecipient(recipient.email)}
                aria-label={`Remove ${recipient.name}`}
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          ))}
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[180px] flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder={`Search ${scope === "customers" ? "customers" : "team members"} by name or email`}
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setOpen(true);
            }}
            onFocus={() => setOpen(true)}
            className="h-9 pl-8 text-sm"
          />
        </div>
        <select
          value={tagFilter}
          onChange={(e) => {
            setTagFilter(e.target.value);
            setOpen(true);
          }}
          className="h-9 rounded-md border border-input bg-transparent px-2 text-sm"
        >
          <option value="">All tags</option>
          {availableTags.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
        {scope === "team" ? (
          <select
            value={roleFilter}
            onChange={(e) => {
              setRoleFilter(e.target.value);
              setOpen(true);
            }}
            className="h-9 rounded-md border border-input bg-transparent px-2 text-sm"
          >
            <option value="">All roles</option>
            {availableRoles.map((option) => (
              <option key={option} value={option}>
                {ROLE_LABELS[option] ?? option}
              </option>
            ))}
          </select>
        ) : null}
        {tagFilter || roleFilter ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-9 px-2 text-xs"
            onClick={() => {
              setTagFilter("");
              setRoleFilter("");
            }}
          >
            Clear
          </Button>
        ) : null}
      </div>

      {open ? (
        <>
          <button
            type="button"
            className="fixed inset-0 z-10"
            aria-label="Close recipient list"
            onClick={() => setOpen(false)}
          />
          <div className="absolute z-20 mt-1 max-h-56 w-full overflow-y-auto rounded-md border border-border bg-card shadow-lg dark:bg-[#ffffff] dark:text-[#102341]">
            {loading ? (
              <p className="p-3 text-sm text-muted-foreground">Searching...</p>
            ) : results.length === 0 ? (
              <p className="p-3 text-sm text-muted-foreground">
                {search.trim() || activeFilter
                  ? "No matches found."
                  : "Type a name to search contacts."}
              </p>
            ) : (
              <ul>
                {results.map((contact) => {
                  const alreadyAdded = contact.email
                    ? selectedEmails.has(contact.email.toLowerCase())
                    : false;
                  return (
                    <li key={contact.id}>
                      <button
                        type="button"
                        disabled={alreadyAdded || !contact.email}
                        onClick={() => addRecipient(contact)}
                        className={cn(
                          "flex w-full flex-col items-start gap-0.5 border-b border-border px-3 py-2 text-left text-sm last:border-b-0 hover:bg-muted/50 dark:hover:bg-muted dark:hover:text-[#102341]",
                          alreadyAdded && "cursor-not-allowed opacity-50"
                        )}
                      >
                        <span className="font-medium">{contact.name}</span>
                        <span className="text-xs text-muted-foreground">{contact.email}</span>
                        {scope === "customers" && contact.tags?.length ? (
                          <span className="text-[10px] text-muted-foreground">
                            {contact.tags.join(", ")}
                          </span>
                        ) : null}
                        {scope === "team" && contact.role ? (
                          <span className="text-[10px] text-muted-foreground">
                            {ROLE_LABELS[contact.role] ?? contact.role}
                          </span>
                        ) : null}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </>
      ) : null}
    </div>
  );
}
