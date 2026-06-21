"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Phone, PhoneOff, Search, X } from "lucide-react";
import { toast } from "sonner";
import { CustomerNameWithBadge } from "@/components/customers/CustomerNameWithBadge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useVoiceDevice } from "@/contexts/VoiceDeviceProvider";
import type { CustomerDTO } from "@/lib/customers/types";

const DIAL_PAD = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "*", "0", "#"];

type Props = {
  initialPhone?: string | null;
  initialCustomerId?: string | null;
  initialName?: string | null;
  compact?: boolean;
  className?: string;
  onCallStarted?: () => void;
};

export function VoiceDialer({
  initialPhone,
  initialCustomerId,
  initialName,
  compact = false,
  className,
  onCallStarted,
}: Props) {
  const { ready, connect, activeCall } = useVoiceDevice();
  const [phone, setPhone] = useState(initialPhone ?? "");
  const [customerId, setCustomerId] = useState(initialCustomerId ?? "");
  const [customerName, setCustomerName] = useState(initialName ?? "");
  const [calling, setCalling] = useState(false);
  const [customerSearch, setCustomerSearch] = useState("");
  const [customers, setCustomers] = useState<CustomerDTO[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);

  useEffect(() => {
    if (initialPhone) setPhone(initialPhone);
  }, [initialPhone]);

  useEffect(() => {
    if (initialCustomerId) setCustomerId(initialCustomerId);
    if (initialName) setCustomerName(initialName);
  }, [initialCustomerId, initialName]);

  const loadCustomers = useCallback(async (query: string) => {
    const q = query.trim();
    if (q.length < 2) {
      setCustomers([]);
      return;
    }
    setSearchLoading(true);
    try {
      const res = await fetch(
        `/api/customers?search=${encodeURIComponent(q)}&status=ACTIVE`
      );
      if (!res.ok) return;
      const data = await res.json();
      setCustomers((data.customers ?? []).filter((c: CustomerDTO) => c.phone));
    } finally {
      setSearchLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      void loadCustomers(customerSearch);
    }, 300);
    return () => clearTimeout(timer);
  }, [customerSearch, loadCustomers]);

  function selectCustomer(customer: CustomerDTO) {
    setCustomerId(customer.id);
    setCustomerName(customer.name);
    setPhone(customer.phone ?? "");
  }

  function clearSelection() {
    setCustomerId("");
    setCustomerName("");
  }

  async function handleCall(toNumber?: string, linkedCustomerId?: string) {
    const number = (toNumber ?? phone).trim();
    if (!number) {
      toast.error("Enter a phone number");
      return;
    }
    if (!ready) {
      toast.error("Softphone not ready — check Twilio Voice settings");
      return;
    }
    if (activeCall) {
      toast.error("Already on a call");
      return;
    }

    setCalling(true);
    try {
      await connect(number, linkedCustomerId ?? (customerId || undefined));
      toast.success("Calling…");
      onCallStarted?.();
    } catch {
      toast.error("Failed to place call");
    } finally {
      setCalling(false);
    }
  }

  const selectedDoNotService = customers.find((c) => c.id === customerId)?.doNotService;

  return (
    <div className={className}>
      {!compact && (
        <div className="mb-3">
          <h3 className="text-lg font-semibold">
            {customerName ? `Call ${customerName}` : "Dialer"}
          </h3>
          <p className="text-sm text-muted-foreground">
            Browser softphone {ready ? "· ready" : "· connecting…"}
          </p>
        </div>
      )}

      <Tabs defaultValue="dial" className="w-full">
        <TabsList className="mb-3 grid w-full grid-cols-2">
          <TabsTrigger value="dial">Dial number</TabsTrigger>
          <TabsTrigger value="customers">Find customer</TabsTrigger>
        </TabsList>

        <TabsContent value="dial" className="space-y-3">
          {customerName ? (
            <div className="flex items-center justify-between rounded-md border bg-muted/40 px-3 py-2 text-sm">
              <CustomerNameWithBadge
                name={customerName}
                doNotService={selectedDoNotService}
              />
              <Button type="button" variant="ghost" size="sm" onClick={clearSelection}>
                Clear
              </Button>
            </div>
          ) : null}

          <Input
            placeholder="(801) 555-0123"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            className={compact ? "text-base" : "text-lg"}
          />

          <div className="grid grid-cols-3 gap-2">
            {DIAL_PAD.map((digit) => (
              <Button
                key={digit}
                variant="outline"
                type="button"
                className={compact ? "h-10 text-base" : "h-12 text-lg"}
                onClick={() => setPhone((prev) => prev + digit)}
              >
                {digit}
              </Button>
            ))}
          </div>

          <div className="flex gap-2">
            <Button
              className="flex-1"
              type="button"
              disabled={
                !phone.trim() ||
                calling ||
                !ready ||
                Boolean(activeCall) ||
                Boolean(selectedDoNotService)
              }
              onClick={() => void handleCall()}
            >
              <Phone className="h-4 w-4" />
              Call
            </Button>
            <Button type="button" variant="outline" onClick={() => setPhone("")}>
              <PhoneOff className="h-4 w-4" />
            </Button>
          </div>

          {selectedDoNotService ? (
            <p className="text-xs text-destructive">This customer is marked DO NOT SERVICE.</p>
          ) : null}
        </TabsContent>

        <TabsContent value="customers" className="space-y-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search customers by name, phone, email…"
              value={customerSearch}
              onChange={(e) => setCustomerSearch(e.target.value)}
              className="pl-9"
            />
          </div>

          <ScrollArea className={compact ? "h-48" : "h-56"}>
            {searchLoading ? (
              <p className="p-2 text-sm text-muted-foreground">Searching…</p>
            ) : customerSearch.trim().length < 2 ? (
              <p className="p-2 text-sm text-muted-foreground">Type at least 2 characters to search.</p>
            ) : customers.length === 0 ? (
              <p className="p-2 text-sm text-muted-foreground">No customers with phone numbers found.</p>
            ) : (
              <ul className="divide-y">
                {customers.map((customer) => (
                  <li key={customer.id} className="flex items-center gap-2 p-2">
                    <div className="min-w-0 flex-1">
                      <CustomerNameWithBadge
                        name={customer.name}
                        doNotService={customer.doNotService}
                        nameClassName="text-sm font-medium"
                      />
                      <p className="truncate text-xs text-muted-foreground">{customer.phone}</p>
                    </div>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={
                        !customer.phone ||
                        calling ||
                        !ready ||
                        Boolean(activeCall) ||
                        customer.doNotService
                      }
                      onClick={() => {
                        selectCustomer(customer);
                        void handleCall(customer.phone!, customer.id);
                      }}
                    >
                      <Phone className="h-4 w-4" />
                    </Button>
                    <Button type="button" size="sm" variant="ghost" asChild>
                      <Link href={`/customers/${customer.id}`}>View</Link>
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </ScrollArea>
        </TabsContent>
      </Tabs>

      {!ready && compact ? (
        <p className="mt-2 text-xs text-amber-600">Softphone connecting…</p>
      ) : null}
    </div>
  );
}

export function VoiceDialerDialog({
  open,
  onClose,
  initialPhone,
  initialCustomerId,
  initialName,
}: {
  open: boolean;
  onClose: () => void;
  initialPhone?: string | null;
  initialCustomerId?: string | null;
  initialName?: string | null;
}) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[200] flex items-start justify-center p-4 pt-20 sm:items-center sm:pt-4">
      <button
        type="button"
        className="absolute inset-0 bg-black/40"
        aria-label="Close dialer"
        onClick={onClose}
      />
      <div className="relative z-10 w-full max-w-md rounded-lg border bg-background p-5 shadow-xl">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">Phone dialer</h2>
            <p className="text-sm text-muted-foreground">Place an outbound call from the app</p>
          </div>
          <Button type="button" variant="ghost" size="icon" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>
        <VoiceDialer
          initialPhone={initialPhone}
          initialCustomerId={initialCustomerId}
          initialName={initialName}
          compact
          onCallStarted={onClose}
        />
      </div>
    </div>
  );
}
