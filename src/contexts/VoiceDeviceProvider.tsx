"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useSession } from "next-auth/react";
import { Device, Call } from "@twilio/voice-sdk";
import { toast } from "sonner";
import { CallWrapUpModal } from "@/components/voice/CallWrapUpModal";
import { normalizePhone } from "@/lib/inbox/contacts";
import {
  closeIncomingCallBrowserNotification,
  ensureNotificationPermission,
  showIncomingCallBrowserNotification,
  showMissedCallBrowserNotification,
} from "@/lib/pwa/browser-notify";
import { formatPhoneDisplay } from "@/lib/inbox/phone";
import type { InboundLineInfo } from "@/components/voice/InboundLineCard";
import type { CallerInfo } from "@/lib/voice/caller-info";

export type { CallerInfo };

export type ActiveCallState = {
  call: Call;
  direction: "inbound" | "outbound";
  remoteNumber: string;
  callerInfo: CallerInfo | null;
  sessionId: string | null;
  /** Company line the caller dialed (inbound only). */
  inboundLine: InboundLineInfo | null;
  muted: boolean;
  onHold: boolean;
  /** Warm/consult transfer in progress — hangup leaves conference running. */
  transferring: boolean;
};

export type IncomingCallBrand = {
  companyId: string | null;
  companyName: string | null;
  brandPrimary: string;
  brandSoft: string;
  isOtherCompany: boolean;
};

type IncomingInvite = {
  call: Call;
  callerInfo: CallerInfo | null;
  brand: IncomingCallBrand;
};

type VoiceIdentityToken = {
  token: string;
  identity: string;
  companyId: string;
  companyName: string;
  brandPrimary: string;
  brandSoft: string;
  primary: boolean;
};

type VoiceContextValue = {
  ready: boolean;
  error: string | null;
  activeCall: ActiveCallState | null;
  incomingCall: IncomingInvite | null;
  connect: (to: string, customerId?: string) => Promise<void>;
  acceptIncoming: () => void;
  rejectIncoming: () => void;
  disconnect: () => void;
  toggleMute: () => void;
  /** Send DTMF tones (0-9, *, #) on the live call. */
  sendDigits: (digits: string) => boolean;
  toggleHold: () => Promise<void>;
  transfer: (
    targetUserId: string,
    type: "warm" | "cold",
    options?: {
      mode?: "agent" | "employee_phone" | "external_number";
      phone?: string;
      displayName?: string;
    }
  ) => Promise<void>;
  /** Open book-appointment UI for the active call's customer. */
  openBookAppointment: () => void;
  bookAppointmentOpen: boolean;
  setBookAppointmentOpen: (open: boolean) => void;
  /** Link a visit booked during the active call into wrap-up + conversion tracking. */
  notifyVisitBooked: (visitId: string) => void;
};

const VoiceContext = createContext<VoiceContextValue | null>(null);

function inviteStillRinging(call: Call) {
  const status = call.status();
  return status === "pending" || status === "ringing";
}

function readCallParam(call: Call, key: string): string | null {
  const custom = call.customParameters?.get(key)?.trim();
  if (custom) return custom;
  const params = call.parameters as Record<string, string>;
  const direct = params[key] ?? params[key.toLowerCase()];
  return direct?.trim() || null;
}

function incomingBrandFromCall(call: Call, selectedCompanyId?: string | null): IncomingCallBrand {
  const companyId = readCallParam(call, "companyId");
  const companyName = readCallParam(call, "companyName");
  return {
    companyId,
    companyName,
    brandPrimary: readCallParam(call, "brandPrimary") || "#10B981",
    brandSoft: readCallParam(call, "brandSoft") || "#D1FAE5",
    isOtherCompany: Boolean(companyId && selectedCompanyId && companyId !== selectedCompanyId),
  };
}

async function lookupCaller(phone: string, companyId?: string | null): Promise<CallerInfo> {
  try {
    const qs = new URLSearchParams({ phone });
    if (companyId) qs.set("companyId", companyId);
    const res = await fetch(`/api/voice/caller-lookup?${qs.toString()}`);
    if (!res.ok) return { phone };
    const data = await res.json();
    return {
      phone,
      name: data.name ?? null,
      customerId: data.customerId ?? null,
      city: data.city ?? null,
      mostRecentVisitAt: data.mostRecentVisitAt ?? null,
      doNotService: data.doNotService ?? false,
    };
  } catch {
    return { phone };
  }
}

async function resolveSessionId(
  callSid: string,
  parentCallSid?: string | null
): Promise<{
  id: string;
  inboundLine: InboundLineInfo | null;
} | null> {
  try {
    const qs = new URLSearchParams({ callSid });
    if (parentCallSid) qs.set("parentCallSid", parentCallSid);
    const res = await fetch(`/api/voice/sessions/by-call?${qs.toString()}`);
    if (!res.ok) return null;
    const data = (await res.json()) as {
      id?: string;
      inboundLineTitle?: string | null;
      trackingSource?: string | null;
      inboundLineE164?: string | null;
      direction?: string;
    };
    if (!data.id) return null;
    const inboundLine =
      data.direction === "INBOUND"
        ? {
            title: data.inboundLineTitle ?? null,
            trackingSource: data.trackingSource ?? null,
            e164: data.inboundLineE164 ?? null,
          }
        : null;
    return { id: data.id, inboundLine };
  } catch {
    return null;
  }
}

async function recordAnswered(
  callSid: string | undefined,
  sessionId: string | null,
  parentCallSid?: string | null
) {
  if (!callSid && !sessionId) return;
  try {
    await fetch("/api/voice/sessions/by-call", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        callSid: callSid || undefined,
        parentCallSid: parentCallSid || undefined,
        sessionId: sessionId || undefined,
        agentCallSid: callSid || undefined,
        answered: true,
      }),
    });
  } catch {
    // ignore — conversion can still heal on disposition
  }
}

async function patchPresence(status: "AVAILABLE" | "ON_CALL" | "OFFLINE" | "AWAY") {
  try {
    await fetch("/api/voice/presence", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
  } catch {
    // ignore
  }
}

export function VoiceDeviceProvider({ children }: { children: ReactNode }) {
  const { data: session, status: sessionStatus } = useSession();
  const deviceRef = useRef<Device | null>(null);
  const extraDevicesRef = useRef<Device[]>([]);
  const deviceIdentityRef = useRef(new Map<Device, string>());
  const refreshingTokenRef = useRef<Promise<boolean> | null>(null);
  const recoveringTransportRef = useRef<Promise<boolean> | null>(null);
  const ringingInvitesRef = useRef(new Set<Call>());
  const settleInviteRef = useRef(new WeakMap<Call, (missed: boolean) => void>());
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeCall, setActiveCall] = useState<ActiveCallState | null>(null);
  const [incomingCall, setIncomingCall] = useState<IncomingInvite | null>(null);
  const [wrapUpSessionId, setWrapUpSessionId] = useState<string | null>(null);
  const [wrapUpVisitId, setWrapUpVisitId] = useState<string | null>(null);
  const [wrapUpOpen, setWrapUpOpen] = useState(false);
  const [bookAppointmentOpen, setBookAppointmentOpen] = useState(false);
  const activeCallRef = useRef<ActiveCallState | null>(null);
  activeCallRef.current = activeCall;
  const selectedCompanyIdRef = useRef(session?.user?.companyId ?? null);
  selectedCompanyIdRef.current = session?.user?.companyId ?? null;

  const bindCall = useCallback(
    async (call: Call, direction: "inbound" | "outbound", remoteNumber: string) => {
      const brand = incomingBrandFromCall(call, selectedCompanyIdRef.current);
      const callerInfo = await lookupCaller(remoteNumber, brand.companyId);
      const callSid = call.parameters.CallSid;
      const parentCallSid =
        (call.parameters as Record<string, string>).ParentCallSid ??
        (call.parameters as Record<string, string>).parentCallSid ??
        null;
      let session = callSid ? await resolveSessionId(callSid, parentCallSid) : null;

      void recordAnswered(callSid, session?.id ?? null, parentCallSid);

      if (!session && callSid) {
        window.setTimeout(() => {
          void resolveSessionId(callSid, parentCallSid).then((resolved) => {
            if (!resolved) return;
            setActiveCall((prev) =>
              prev && prev.call === call
                ? {
                    ...prev,
                    sessionId: resolved.id,
                    inboundLine: resolved.inboundLine ?? prev.inboundLine,
                  }
                : prev
            );
            void recordAnswered(callSid, resolved.id, parentCallSid);
          });
        }, 1500);
      }

      const state: ActiveCallState = {
        call,
        direction,
        remoteNumber,
        callerInfo,
        sessionId: session?.id ?? null,
        inboundLine: session?.inboundLine ?? null,
        muted: false,
        onHold: false,
        transferring: false,
      };

      setActiveCall(state);
      settleInviteRef.current.get(call)?.(false);
      setIncomingCall(null);
      void closeIncomingCallBrowserNotification();
      void patchPresence("ON_CALL");

      call.on("disconnect", () => {
        setActiveCall((prev) => {
          if (prev?.sessionId) {
            if (prev.transferring) {
              void fetch(`/api/voice/calls/${prev.sessionId}/transfer/leave`, {
                method: "POST",
              }).catch(() => {});
            }
            setWrapUpSessionId(prev.sessionId);
            setWrapUpOpen(true);
          }
          return null;
        });
        void patchPresence("AVAILABLE");
      });

      call.on("cancel", () => {
        setIncomingCall(null);
        void closeIncomingCallBrowserNotification();
      });

      call.on("reject", () => {
        setIncomingCall(null);
        void closeIncomingCallBrowserNotification();
      });
    },
    []
  );

  const notifyVisitBooked = useCallback((visitId: string) => {
    setWrapUpVisitId(visitId);
  }, []);

  const fetchVoiceTokenPayload = useCallback(async () => {
    const res = await fetch("/api/inbox/voice/token", { method: "POST" });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      if (res.status === 503) {
        throw new Error(data.error ?? "Twilio Voice is not configured");
      }
      throw new Error(data.error ?? "Failed to get voice token");
    }
    const data = await res.json();
    if (!data.token || typeof data.token !== "string") {
      throw new Error("Voice token response was empty");
    }
    const identities = Array.isArray(data.identities)
      ? (data.identities as VoiceIdentityToken[]).filter(
          (item) => item && typeof item.token === "string" && typeof item.identity === "string"
        )
      : [
          {
            token: data.token as string,
            identity: typeof data.identity === "string" ? data.identity : "",
            companyId: "",
            companyName: "",
            brandPrimary: "",
            brandSoft: "",
            primary: true,
          },
        ];
    return {
      token: data.token as string,
      identity: typeof data.identity === "string" ? data.identity : "",
      identities,
    };
  }, []);

  const refreshDeviceToken = useCallback(
    async (opts?: { reRegister?: boolean; forceRegister?: boolean; silent?: boolean }) => {
      const device = deviceRef.current;
      if (!device) return false;
      // Coalesce concurrent refresh attempts (visibility + error handlers race).
      if (refreshingTokenRef.current) {
        return refreshingTokenRef.current;
      }

      const run = (async () => {
        try {
          const payload = await fetchVoiceTokenPayload();
          const current = deviceRef.current;
          if (!current) return false;
          current.updateToken(payload.token);
          for (const extra of extraDevicesRef.current) {
            const identity = deviceIdentityRef.current.get(extra);
            const match = payload.identities.find((item) => item.identity === identity);
            if (match) extra.updateToken(match.token);
          }
          if (opts?.forceRegister || (opts?.reRegister && current.state !== "registered")) {
            await current.register();
            for (const extra of extraDevicesRef.current) {
              if (extra.state !== "registered") {
                try {
                  await extra.register();
                } catch {
                  // ignore — extra company lines are best-effort
                }
              }
            }
          }
          setError(null);
          return true;
        } catch (err) {
          const message = err instanceof Error ? err.message : "Voice token refresh failed";
          setError(message);
          if (!opts?.silent) {
            toast.error(message);
          }
          return false;
        } finally {
          refreshingTokenRef.current = null;
        }
      })();

      refreshingTokenRef.current = run;
      return run;
    },
    [fetchVoiceTokenPayload]
  );

  const recoverVoiceTransport = useCallback(
    async (opts?: { silent?: boolean }) => {
      if (recoveringTransportRef.current) {
        return recoveringTransportRef.current;
      }

      const run = (async () => {
        try {
          const device = deviceRef.current;
          if (!device) return false;

          // Don't bounce registration mid-call — only refresh the JWT.
          if (device.isBusy) {
            return refreshDeviceToken({ silent: opts?.silent ?? true });
          }

          const tokenOk = await refreshDeviceToken({
            silent: opts?.silent ?? true,
          });
          if (!tokenOk) return false;

          const current = deviceRef.current;
          if (!current || current.isBusy) return tokenOk;

          // State can still say "registered" with a dead signaling socket after a
          // backgrounded tab. Bounce registration to rebuild the transport.
          try {
            if (current.state === "registered") {
              await current.unregister();
            }
          } catch {
            // ignore — register() below is what matters
          }
          try {
            await current.register();
            for (const extra of extraDevicesRef.current) {
              try {
                if (extra.state === "registered") {
                  await extra.unregister();
                }
              } catch {
                // ignore
              }
              try {
                await extra.register();
              } catch {
                // Other-company lines are best-effort
              }
            }
            setError(null);
            return true;
          } catch {
            return false;
          }
        } finally {
          recoveringTransportRef.current = null;
        }
      })();

      recoveringTransportRef.current = run;
      return run;
    },
    [refreshDeviceToken]
  );

  useEffect(() => {
    if (sessionStatus !== "authenticated" || !session?.user?.id) {
      setReady(false);
      return;
    }

    let cancelled = false;
    let heartbeat: ReturnType<typeof setInterval> | null = null;

    async function setup() {
      try {
        const payload = await fetchVoiceTokenPayload();
        if (cancelled) return;

        const attachIncoming = (device: Device) => {
          device.on("incoming", (call) => {
            if (activeCallRef.current) {
              call.reject();
              const from = call.parameters.From ?? "Unknown";
              toast.message("Caller waiting in queue", {
                description: `${formatPhoneDisplay(from) || from} will hold until you finish this call.`,
                duration: 8000,
              });
              return;
            }
            const from = call.parameters.From ?? "Unknown";
            const brand = incomingBrandFromCall(call, selectedCompanyIdRef.current);
            ringingInvitesRef.current.add(call);
            let callerLabel = formatPhoneDisplay(from) || from;

            const endRinging = (missed: boolean) => {
              if (!ringingInvitesRef.current.has(call)) return;
              ringingInvitesRef.current.delete(call);
              settleInviteRef.current.delete(call);
              window.clearInterval(watch);
              setIncomingCall((prev) => (prev?.call === call ? null : prev));
              void closeIncomingCallBrowserNotification();
              if (missed) {
                const missedTitle = brand.companyName
                  ? `Missed call · ${brand.companyName}`
                  : "Missed call";
                toast(missedTitle, { description: callerLabel, duration: 8000 });
                void showMissedCallBrowserNotification({
                  title: missedTitle,
                  body: callerLabel,
                });
              }
            };

            settleInviteRef.current.set(call, endRinging);

            const watch = window.setInterval(() => {
              if (!inviteStillRinging(call)) endRinging(true);
            }, 400);

            call.on("cancel", () => endRinging(true));
            call.on("disconnect", () => {
              if (ringingInvitesRef.current.has(call)) endRinging(true);
            });
            call.on("error", () => endRinging(true));

            if (!inviteStillRinging(call)) {
              endRinging(true);
              return;
            }

            void lookupCaller(from, brand.companyId).then((callerInfo) => {
              if (!ringingInvitesRef.current.has(call) || !inviteStillRinging(call)) {
                endRinging(true);
                return;
              }
              if (callerInfo.name?.trim()) {
                callerLabel = `${callerInfo.name.trim()} · ${formatPhoneDisplay(from) || from}`;
              }
              setIncomingCall({ call, callerInfo, brand });
              void showIncomingCallBrowserNotification({
                title: brand.companyName?.trim()
                  ? `Incoming · ${brand.companyName.trim()}`
                  : "Incoming call",
                body: callerLabel,
              });
            });
          });
        };

        const attachPrimaryTransport = (device: Device) => {
          device.on("registered", () => {
            setReady(true);
            setError(null);
            void patchPresence("AVAILABLE");
            void ensureNotificationPermission();
          });

          device.on("unregistered", () => {
            setReady(false);
            if (
              cancelled ||
              document.visibilityState === "hidden" ||
              recoveringTransportRef.current
            ) {
              return;
            }
            void recoverVoiceTransport({ silent: true });
          });

          device.on("error", (err) => {
            const message = err.message ?? "Voice device error";
            const code = typeof err.code === "number" ? err.code : undefined;
            const isTokenError =
              /access.?token/i.test(message) ||
              code === 20101 ||
              code === 20104 ||
              code === 31204 ||
              code === 31205;
            const isTransportError =
              code === 31009 ||
              /no transport available/i.test(message) ||
              /transport error/i.test(message);

            if (isTokenError || isTransportError) {
              void recoverVoiceTransport({ silent: true }).then((ok) => {
                if (!ok && !cancelled) setError(message);
              });
              return;
            }

            setError(message);
            if (document.visibilityState === "visible") {
              toast.error(message);
            }
          });

          device.on("tokenWillExpire", () => {
            void refreshDeviceToken({ silent: true });
          });
        };

        extraDevicesRef.current = [];
        deviceIdentityRef.current.clear();

        const primaryItem =
          payload.identities.find((item) => item.primary) ?? payload.identities[0] ?? null;
        const extraItems = payload.identities.filter(
          (item) => item.identity !== (primaryItem?.identity ?? payload.identity)
        );

        const primaryDevice = new Device(primaryItem?.token ?? payload.token, {
          closeProtection: true,
          tokenRefreshMs: 5 * 60 * 1000,
        });
        deviceRef.current = primaryDevice;
        if (primaryItem?.identity) {
          deviceIdentityRef.current.set(primaryDevice, primaryItem.identity);
        }
        attachPrimaryTransport(primaryDevice);
        attachIncoming(primaryDevice);
        await primaryDevice.register();
        if (cancelled) return;

        for (const item of extraItems) {
          try {
            const extra = new Device(item.token, {
              closeProtection: false,
              tokenRefreshMs: 5 * 60 * 1000,
            });
            deviceIdentityRef.current.set(extra, item.identity);
            extra.on("tokenWillExpire", () => {
              void refreshDeviceToken({ silent: true });
            });
            extra.on("error", () => {
              void refreshDeviceToken({ silent: true });
            });
            attachIncoming(extra);
            await extra.register();
            if (cancelled) {
              extra.destroy();
              break;
            }
            extraDevicesRef.current.push(extra);
          } catch {
            // Other-company lines are best-effort so the selected company still works.
          }
        }

        heartbeat = setInterval(() => {
          void patchPresence(activeCallRef.current ? "ON_CALL" : "AVAILABLE");
        }, 30000);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Voice setup failed");
        }
      }
    }

    void setup();

    const onVisibilityChange = () => {
      if (document.visibilityState !== "visible" || cancelled) return;
      if (!deviceRef.current) return;
      // Background tabs freeze timers and kill the Voice signaling socket.
      // Always refresh the JWT and force re-register — state can still say
      // "registered" even when the transport is already dead.
      void recoverVoiceTransport({ silent: true });
    };

    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisibilityChange);
      if (heartbeat) clearInterval(heartbeat);
      void patchPresence("OFFLINE");
      for (const extra of extraDevicesRef.current) {
        try {
          extra.destroy();
        } catch {
          // ignore
        }
      }
      extraDevicesRef.current = [];
      deviceIdentityRef.current.clear();
      deviceRef.current?.destroy();
      deviceRef.current = null;
      setReady(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionStatus, session?.user?.id, fetchVoiceTokenPayload, refreshDeviceToken, recoverVoiceTransport]);

  const connect = useCallback(
    async (to: string, customerId?: string) => {
      const device = deviceRef.current;
      const user = session?.user;
      if (!device || !user?.companyId) {
        toast.error("Phone not ready");
        return;
      }

      const phoneNumber = normalizePhone(to.trim());
      if (!phoneNumber.replace(/\D/g, "").length) {
        toast.error("Enter a valid phone number");
        return;
      }

      // Use phoneNumber — Twilio reserves "To" on client outbound webhooks and drops it.
      const call = await device.connect({
        params: {
          phoneNumber,
          companyId: user.companyId,
          userId: user.id,
          customerId: customerId ?? "",
        },
      });

      await bindCall(call, "outbound", phoneNumber);
    },
    [bindCall, session?.user]
  );

  const acceptIncoming = useCallback(() => {
    if (!incomingCall) return;
    if (!inviteStillRinging(incomingCall.call)) {
      settleInviteRef.current.get(incomingCall.call)?.(true);
      return;
    }
    settleInviteRef.current.get(incomingCall.call)?.(false);
    incomingCall.call.accept();
    const from = incomingCall.call.parameters.From ?? "Unknown";
    void bindCall(incomingCall.call, "inbound", from);
  }, [bindCall, incomingCall]);

  const rejectIncoming = useCallback(() => {
    if (!incomingCall) return;
    settleInviteRef.current.get(incomingCall.call)?.(false);
    incomingCall.call.reject();
  }, [incomingCall]);

  const disconnect = useCallback(() => {
    if (!activeCall) return;

    // Warm transfer leave: CSR exits, customer stays with the transferred party.
    if (activeCall.transferring && activeCall.sessionId) {
      void fetch(`/api/voice/calls/${activeCall.sessionId}/transfer/leave`, {
        method: "POST",
      }).catch(() => {});
      toast.success("You left the call — the transfer continues");
      activeCall.call.disconnect();
      setActiveCall(null);
      void patchPresence("AVAILABLE");
      return;
    }

    // Normal hangup (including while customer is on hold): end everyone.
    if (activeCall.sessionId) {
      void fetch(`/api/voice/calls/${activeCall.sessionId}/hangup`, {
        method: "POST",
      }).catch(() => {});
    }
    activeCall.call.disconnect();
    setActiveCall(null);
    void patchPresence("AVAILABLE");
  }, [activeCall]);

  const toggleMute = useCallback(() => {
    if (!activeCall) return;
    const next = !activeCall.muted;
    activeCall.call.mute(next);
    setActiveCall({ ...activeCall, muted: next });
  }, [activeCall]);

  const sendDigits = useCallback((digits: string) => {
    const call = activeCallRef.current?.call;
    if (!call) return false;
    const sanitized = digits.replace(/[^0-9*#wW]/g, "");
    if (!sanitized) return false;
    try {
      call.sendDigits(sanitized);
      return true;
    } catch {
      toast.error("Could not send keypad tone");
      return false;
    }
  }, []);

  const toggleHold = useCallback(async () => {
    if (!activeCall?.sessionId) {
      toast.error("Hold unavailable for this call — reconnecting session…");
      return;
    }
    const next = !activeCall.onHold;
    const res = await fetch(`/api/voice/calls/${activeCall.sessionId}/hold`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ hold: next }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      toast.error(data.error ?? "Failed to update hold");
      return;
    }
    setActiveCall({ ...activeCall, onHold: next });
  }, [activeCall]);

  const transfer = useCallback(
    async (
      targetUserId: string,
      type: "warm" | "cold",
      options?: {
        mode?: "agent" | "employee_phone" | "external_number";
        phone?: string;
        displayName?: string;
      }
    ) => {
      if (!activeCall?.sessionId) {
        toast.error("Transfer unavailable for this call");
        return;
      }
      const mode = options?.mode ?? "agent";
      const res = await fetch(`/api/voice/calls/${activeCall.sessionId}/transfer`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          targetUserId: targetUserId || undefined,
          type,
          mode,
          phone: options?.phone,
          displayName: options?.displayName,
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        toast.error(data.error ?? "Transfer failed");
        return;
      }
      if (type === "cold") {
        activeCall.call.disconnect();
        setActiveCall(null);
        toast.success("Call transferred");
      } else {
        const external = mode === "employee_phone" || mode === "external_number";
        setActiveCall({ ...activeCall, transferring: true, onHold: external ? true : activeCall.onHold });
        toast.success(
          external
            ? "Ringing phone — customer is on hold. Hang up when ready to leave the call."
            : "Consultation started — hang up when ready to leave the call"
        );
      }
    },
    [activeCall]
  );

  const openBookAppointment = useCallback(() => {
    setBookAppointmentOpen(true);
  }, []);

  const value = useMemo(
    () => ({
      ready,
      error,
      activeCall,
      incomingCall,
      connect,
      acceptIncoming,
      rejectIncoming,
      disconnect,
      toggleMute,
      sendDigits,
      toggleHold,
      transfer,
      openBookAppointment,
      bookAppointmentOpen,
      setBookAppointmentOpen,
      notifyVisitBooked,
    }),
    [
      ready,
      error,
      activeCall,
      incomingCall,
      connect,
      acceptIncoming,
      rejectIncoming,
      disconnect,
      toggleMute,
      sendDigits,
      toggleHold,
      transfer,
      openBookAppointment,
      bookAppointmentOpen,
      notifyVisitBooked,
    ]
  );

  return (
    <VoiceContext.Provider value={value}>
      {children}
      <CallWrapUpModal
        open={wrapUpOpen}
        sessionId={wrapUpSessionId}
        visitId={wrapUpVisitId}
        onClose={() => {
          setWrapUpOpen(false);
          setWrapUpSessionId(null);
          setWrapUpVisitId(null);
        }}
      />
    </VoiceContext.Provider>
  );
}

export function useVoiceDevice() {
  const ctx = useContext(VoiceContext);
  if (!ctx) {
    throw new Error("useVoiceDevice must be used within VoiceDeviceProvider");
  }
  return ctx;
}
