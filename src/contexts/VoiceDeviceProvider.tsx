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
import type { CallerInfo } from "@/lib/voice/caller-info";

export type { CallerInfo };

export type ActiveCallState = {
  call: Call;
  direction: "inbound" | "outbound";
  remoteNumber: string;
  callerInfo: CallerInfo | null;
  sessionId: string | null;
  muted: boolean;
  onHold: boolean;
  /** Warm/consult transfer in progress — hangup leaves conference running. */
  transferring: boolean;
};

type VoiceContextValue = {
  ready: boolean;
  error: string | null;
  activeCall: ActiveCallState | null;
  incomingCall: { call: Call; callerInfo: CallerInfo | null } | null;
  connect: (to: string, customerId?: string) => Promise<void>;
  acceptIncoming: () => void;
  rejectIncoming: () => void;
  disconnect: () => void;
  toggleMute: () => void;
  toggleHold: () => Promise<void>;
  transfer: (
    targetUserId: string,
    type: "warm" | "cold",
    options?: { mode?: "agent" | "employee_phone" }
  ) => Promise<void>;
  /** Open book-appointment UI for the active call's customer. */
  openBookAppointment: () => void;
  bookAppointmentOpen: boolean;
  setBookAppointmentOpen: (open: boolean) => void;
  /** Link a visit booked during the active call into wrap-up + conversion tracking. */
  notifyVisitBooked: (visitId: string) => void;
};

const VoiceContext = createContext<VoiceContextValue | null>(null);

async function lookupCaller(phone: string): Promise<CallerInfo> {
  try {
    const res = await fetch(`/api/voice/caller-lookup?phone=${encodeURIComponent(phone)}`);
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
): Promise<string | null> {
  try {
    const qs = new URLSearchParams({ callSid });
    if (parentCallSid) qs.set("parentCallSid", parentCallSid);
    const res = await fetch(`/api/voice/sessions/by-call?${qs.toString()}`);
    if (!res.ok) return null;
    const data = await res.json();
    return data.id ?? null;
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
  const refreshingTokenRef = useRef<Promise<boolean> | null>(null);
  const recoveringTransportRef = useRef(false);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeCall, setActiveCall] = useState<ActiveCallState | null>(null);
  const [incomingCall, setIncomingCall] = useState<{
    call: Call;
    callerInfo: CallerInfo | null;
  } | null>(null);
  const [wrapUpSessionId, setWrapUpSessionId] = useState<string | null>(null);
  const [wrapUpVisitId, setWrapUpVisitId] = useState<string | null>(null);
  const [wrapUpOpen, setWrapUpOpen] = useState(false);
  const [bookAppointmentOpen, setBookAppointmentOpen] = useState(false);

  const bindCall = useCallback(
    async (call: Call, direction: "inbound" | "outbound", remoteNumber: string) => {
      const callerInfo = await lookupCaller(remoteNumber);
      const callSid = call.parameters.CallSid;
      const parentCallSid =
        (call.parameters as Record<string, string>).ParentCallSid ??
        (call.parameters as Record<string, string>).parentCallSid ??
        null;
      let sessionId = callSid ? await resolveSessionId(callSid, parentCallSid) : null;

      void recordAnswered(callSid, sessionId, parentCallSid);

      if (!sessionId && callSid) {
        window.setTimeout(() => {
          void resolveSessionId(callSid, parentCallSid).then((id) => {
            if (!id) return;
            setActiveCall((prev) =>
              prev && prev.call === call ? { ...prev, sessionId: id } : prev
            );
            void recordAnswered(callSid, id, parentCallSid);
          });
        }, 1500);
      }

      const state: ActiveCallState = {
        call,
        direction,
        remoteNumber,
        callerInfo,
        sessionId,
        muted: false,
        onHold: false,
        transferring: false,
      };

      setActiveCall(state);
      setIncomingCall(null);
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
      });

      call.on("reject", () => {
        setIncomingCall(null);
      });
    },
    []
  );

  const notifyVisitBooked = useCallback((visitId: string) => {
    setWrapUpVisitId(visitId);
  }, []);

  const fetchVoiceToken = useCallback(async () => {
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
    return data.token as string;
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
          const token = await fetchVoiceToken();
          const current = deviceRef.current;
          if (!current) return false;
          current.updateToken(token);
          if (opts?.forceRegister || (opts?.reRegister && current.state !== "registered")) {
            await current.register();
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
    [fetchVoiceToken]
  );

  const recoverVoiceTransport = useCallback(
    async (opts?: { silent?: boolean }) => {
      if (recoveringTransportRef.current) return false;
      recoveringTransportRef.current = true;
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
          setError(null);
          return true;
        } catch {
          return false;
        }
      } finally {
        recoveringTransportRef.current = false;
      }
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
        const token = await fetchVoiceToken();
        if (cancelled) return;

        // Refresh well before expiry so background-tab timer throttling
        // cannot let the JWT expire before tokenWillExpire fires.
        const device = new Device(token, {
          closeProtection: true,
          tokenRefreshMs: 5 * 60 * 1000,
        });
        deviceRef.current = device;

        device.on("registered", () => {
          setReady(true);
          setError(null);
          void patchPresence("AVAILABLE");
        });

        device.on("unregistered", () => {
          setReady(false);
          // Skip if we intentionally bounced registration during transport recovery.
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
          // 31009: signaling WS dropped (common after background tabs). Recover quietly.
          const isTransportError =
            code === 31009 ||
            /no transport available/i.test(message) ||
            /transport error/i.test(message);

          if (isTokenError || isTransportError) {
            void (async () => {
              const ok = await recoverVoiceTransport({ silent: true });
              if (ok || cancelled) return;
              setError(message);
              toast.error(message);
            })();
            return;
          }

          setError(message);
          toast.error(message);
        });

        device.on("incoming", async (call) => {
          const from = call.parameters.From ?? "Unknown";
          const callerInfo = await lookupCaller(from);
          setIncomingCall({ call, callerInfo });
        });

        device.on("tokenWillExpire", () => {
          void refreshDeviceToken({ silent: true });
        });

        await device.register();

        heartbeat = setInterval(() => {
          void patchPresence(activeCall ? "ON_CALL" : "AVAILABLE");
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
      deviceRef.current?.destroy();
      deviceRef.current = null;
      setReady(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionStatus, session?.user?.id, fetchVoiceToken, refreshDeviceToken, recoverVoiceTransport]);

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
    incomingCall.call.accept();
    const from = incomingCall.call.parameters.From ?? "Unknown";
    void bindCall(incomingCall.call, "inbound", from);
  }, [bindCall, incomingCall]);

  const rejectIncoming = useCallback(() => {
    incomingCall?.call.reject();
    setIncomingCall(null);
  }, [incomingCall]);

  const disconnect = useCallback(() => {
    if (activeCall?.transferring && activeCall.sessionId) {
      void fetch(`/api/voice/calls/${activeCall.sessionId}/transfer/leave`, {
        method: "POST",
      }).catch(() => {});
      toast.success("You left the call — the transfer continues");
    }
    activeCall?.call.disconnect();
    setActiveCall(null);
    void patchPresence("AVAILABLE");
  }, [activeCall]);

  const toggleMute = useCallback(() => {
    if (!activeCall) return;
    const next = !activeCall.muted;
    activeCall.call.mute(next);
    setActiveCall({ ...activeCall, muted: next });
  }, [activeCall]);

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
      options?: { mode?: "agent" | "employee_phone" }
    ) => {
      if (!activeCall?.sessionId) {
        toast.error("Transfer unavailable for this call");
        return;
      }
      const mode = options?.mode ?? "agent";
      const res = await fetch(`/api/voice/calls/${activeCall.sessionId}/transfer`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetUserId, type, mode }),
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
        setActiveCall({ ...activeCall, transferring: true });
        toast.success(
          mode === "employee_phone"
            ? "Ringing employee — hang up when ready to leave the call"
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
