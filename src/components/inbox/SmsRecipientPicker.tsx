"use client";

import { useCallback, useEffect, useState } from "react";
import { Search, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { formatPhoneDisplay } from "@/lib/inbox/phone";
import type { CustomerTeamScope } from "@/lib/inbox/types";

export type SmsRecipient = {
  phone: string;
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
  INSTALLER: "Installer",
  SALES: "Sales",
};

type Props = {
  scope: CustomerTeamScope;
  value: SmsRecipient | null;
  onChange: (recipient: SmsRecipient | null) => void;
  className?: string;
};

function looksLikePhone(input: string) {
  const digits = input.replace(/\D/g, "");
  return digits.length >= 7;
}

export function SmsRecipientPicker({ scope, value, onChange, className }: Props) {
  const [search, setSearch] = useState("");
  const [tagFilter, setTagFilter] = useState("");
  const [roleFilter, setRoleFilter] = useState("");
  const [results, setResults] = useState<ContactResult[]>([]);
  const [availableTags, setAvailableTags] = useState<string[]>([]);
  const [availableRoles, setAvailableRoles] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);

  const apiScope = scope === "customers" ? "external" : "internal";

  const loadContacts = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ scope: apiScope, for: "sms" });
      if (search.trim()) params.set("search", search.trim());
      if (tagFilter) params.set("tag", tagFilter);
      if (roleFilter) params.set("role", roleFilter);

      const res = await fetch(`/api/inbox/contacts?${params}`);
      if (!res.ok) return;
      const data = await res.json();
      const list: ContactResult[] =
        apiScope === "internal" ? (data.employees ?? []) : (data.customers ?? []);
      setResults(list.filter((item) => item.phone));
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

  function selectContact(contact: ContactResult) {
    if (!contact.phone) return;
    onChange({
      phone: contact.phone,
      name: contact.name,
      ...(apiScope === "external" ? { customerId: contact.id } : { userId: contact.id }),
    });
    setSearch("");
    setOpen(false);
  }

  function selectManualPhone() {
    const trimmed = search.trim();
    if (!looksLikePhone(trimmed)) return;
    onChange({ phone: trimmed, name: formatPhoneDisplay(trimmed) });
    setSearch("");
    setOpen(false);
  }

  const activeFilter = tagFilter || roleFilter;
  const showManualOption = looksLikePhone(search) && !loading;

  return (
    <div className={cn("relative", className)}>
      {value ? (
        <div className="mb-2">
          <Badge variant="secondary" className="gap-1 pr-1">
            <span className="max-w-[200px] truncate">{value.name}</span>
            <span className="text-muted-foreground">·</span>
            <span className="max-w-[140px] truncate text-xs">
              {formatPhoneDisplay(value.phone)}
            </span>
            <button
              type="button"
              className="rounded p-0.5 hover:bg-muted"
              onClick={() => onChange(null)}
              aria-label={`Remove ${value.name}`}
            >
              <X className="h-3 w-3" />
            </button>
          </Badge>
        </div>
      ) : null}

      {!value ? (
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-[180px] flex-1">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder={`Search ${scope === "customers" ? "customers" : "team members"} by name or phone`}
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
      ) : null}

      {open && !value ? (
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
            ) : (
              <ul>
                {showManualOption ? (
                  <li>
                    <button
                      type="button"
                      onClick={selectManualPhone}
                      className="flex w-full flex-col items-start gap-0.5 border-b border-border px-3 py-2 text-left text-sm hover:bg-muted/50 dark:hover:bg-muted dark:hover:text-[#102341]"
                    >
                      <span className="font-medium">Text {formatPhoneDisplay(search.trim())}</span>
                      <span className="text-xs text-muted-foreground">Use this phone number</span>
                    </button>
                  </li>
                ) : null}
                {results.length === 0 && !showManualOption ? (
                  <li>
                    <p className="p-3 text-sm text-muted-foreground">
                      {search.trim() || activeFilter
                        ? "No matches found. Enter a phone number to text directly."
                        : "Type a name or phone number to search."}
                    </p>
                  </li>
                ) : (
                  results.map((contact) => (
                    <li key={contact.id}>
                      <button
                        type="button"
                        disabled={!contact.phone}
                        onClick={() => selectContact(contact)}
                        className="flex w-full flex-col items-start gap-0.5 border-b border-border px-3 py-2 text-left text-sm last:border-b-0 hover:bg-muted/50 dark:hover:bg-muted dark:hover:text-[#102341]"
                      >
                        <span className="font-medium">{contact.name}</span>
                        <span className="text-xs text-muted-foreground">
                          {contact.phone ? formatPhoneDisplay(contact.phone) : "No phone on file"}
                        </span>
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
                  ))
                )}
              </ul>
            )}
          </div>
        </>
      ) : null}
    </div>
  );
}
