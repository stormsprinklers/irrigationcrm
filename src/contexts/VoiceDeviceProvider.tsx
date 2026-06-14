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

export type CallerInfo = {
  phone: string;
  name?: string | null;
  customerId?: string | null;
};

export type ActiveCallState = {
  call: Call;
  direction: "inbound" | "outbound";
  remoteNumber: string;
  callerInfo: CallerInfo | null;
  sessionId: string | null;
  muted: boolean;
  onHold: boolean;
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
  transfer: (targetUserId: string, type: "warm" | "cold") => Promise<void>;
  completeWarmTransfer: () => Promise<void>;
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
    };
  } catch {
    return { phone };
  }
}

async function resolveSessionId(callSid: string): Promise<string | null> {
  try {
    const res = await fetch(`/api/voice/sessions/by-call?callSid=${encodeURIComponent(callSid)}`);
    if (!res.ok) return null;
    const data = await res.json();
    return data.id ?? null;
  } catch {
    return null;
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
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeCall, setActiveCall] = useState<ActiveCallState | null>(null);
  const [incomingCall, setIncomingCall] = useState<{
    call: Call;
    callerInfo: CallerInfo | null;
  } | null>(null);

  const bindCall = useCallback(
    async (call: Call, direction: "inbound" | "outbound", remoteNumber: string) => {
      const callerInfo = await lookupCaller(remoteNumber);
      const callSid = call.parameters.CallSid;
      const sessionId = callSid ? await resolveSessionId(callSid) : null;

      const state: ActiveCallState = {
        call,
        direction,
        remoteNumber,
        callerInfo,
        sessionId,
        muted: false,
        onHold: false,
      };

      setActiveCall(state);
      setIncomingCall(null);
      void patchPresence("ON_CALL");

      call.on("disconnect", () => {
        setActiveCall(null);
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

  useEffect(() => {
    if (sessionStatus !== "authenticated" || !session?.user?.id) {
      setReady(false);
      return;
    }

    let cancelled = false;
    let heartbeat: ReturnType<typeof setInterval> | null = null;

    async function setup() {
      try {
        const res = await fetch("/api/inbox/voice/token", { method: "POST" });
        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.error ?? "Failed to get voice token");
        }
        const { token } = await res.json();
        if (cancelled) return;

        const device = new Device(token, {
          closeProtection: true,
        });
        deviceRef.current = device;

        device.on("registered", () => {
          setReady(true);
          setError(null);
          void patchPresence("AVAILABLE");
        });

        device.on("error", (err) => {
          setError(err.message);
          toast.error(err.message);
        });

        device.on("incoming", async (call) => {
          const from = call.parameters.From ?? "Unknown";
          const callerInfo = await lookupCaller(from);
          setIncomingCall({ call, callerInfo });
        });

        device.on("tokenWillExpire", async () => {
          const refresh = await fetch("/api/inbox/voice/token", { method: "POST" });
          if (refresh.ok) {
            const { token: newToken } = await refresh.json();
            device.updateToken(newToken);
          }
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

    return () => {
      cancelled = true;
      if (heartbeat) clearInterval(heartbeat);
      void patchPresence("OFFLINE");
      deviceRef.current?.destroy();
      deviceRef.current = null;
      setReady(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionStatus, session?.user?.id]);

  const connect = useCallback(
    async (to: string, customerId?: string) => {
      const device = deviceRef.current;
      const user = session?.user;
      if (!device || !user?.companyId) {
        toast.error("Phone not ready");
        return;
      }

      const call = await device.connect({
        params: {
          To: to,
          companyId: user.companyId,
          userId: user.id,
          customerId: customerId ?? "",
        },
      });

      await bindCall(call, "outbound", to);
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
      toast.error("Hold unavailable for this call");
      return;
    }
    const next = !activeCall.onHold;
    const res = await fetch(`/api/voice/calls/${activeCall.sessionId}/hold`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ hold: next }),
    });
    if (!res.ok) {
      toast.error("Failed to update hold");
      return;
    }
    setActiveCall({ ...activeCall, onHold: next });
  }, [activeCall]);

  const transfer = useCallback(
    async (targetUserId: string, type: "warm" | "cold") => {
      if (!activeCall?.sessionId) {
        toast.error("Transfer unavailable for this call");
        return;
      }
      const res = await fetch(`/api/voice/calls/${activeCall.sessionId}/transfer`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetUserId, type }),
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
        toast.success("Consultation started — complete transfer when ready");
      }
    },
    [activeCall]
  );

  const completeWarmTransfer = useCallback(async () => {
    if (!activeCall?.sessionId) return;
    const res = await fetch(`/api/voice/calls/${activeCall.sessionId}/transfer/complete`, {
      method: "POST",
    });
    if (!res.ok) {
      toast.error("Failed to complete transfer");
      return;
    }
    activeCall.call.disconnect();
    setActiveCall(null);
    toast.success("Transfer completed");
  }, [activeCall]);

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
      completeWarmTransfer,
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
      completeWarmTransfer,
    ]
  );

  return <VoiceContext.Provider value={value}>{children}</VoiceContext.Provider>;
}

export function useVoiceDevice() {
  const ctx = useContext(VoiceContext);
  if (!ctx) {
    throw new Error("useVoiceDevice must be used within VoiceDeviceProvider");
  }
  return ctx;
}
