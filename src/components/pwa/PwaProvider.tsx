"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import { Bell, Share, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  isIosDevice,
  isStandaloneDisplay,
  registerRadarServiceWorker,
  urlBase64ToUint8Array,
} from "@/lib/pwa/client";

const DISMISS_INSTALL_KEY = "radar-pwa-install-dismissed";

type PushState =
  | "loading"
  | "unsupported"
  | "needs-install"
  | "prompt"
  | "subscribed"
  | "denied"
  | "unconfigured"
  | "error";

async function loadPushPublicKey(): Promise<string | null> {
  const response = await fetch("/api/push/vapid-public-key", { cache: "no-store" });
  const data = (await response.json().catch(() => ({}))) as {
    configured?: boolean;
    publicKey?: string | null;
  };
  return response.ok && data.configured && data.publicKey ? data.publicKey : null;
}

function subscriptionUsesKey(subscription: PushSubscription, publicKey: string) {
  const currentKey = subscription.options.applicationServerKey;
  if (!currentKey) return true;
  const current = new Uint8Array(currentKey);
  const expected = urlBase64ToUint8Array(publicKey);
  return current.length === expected.length && current.every((value, index) => value === expected[index]);
}

async function savePushSubscription(subscription: PushSubscription) {
  const json = subscription.toJSON();
  const response = await fetch("/api/push/subscribe", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ endpoint: json.endpoint, keys: json.keys }),
  });
  if (!response.ok) {
    const data = (await response.json().catch(() => ({}))) as { error?: string };
    throw new Error(data.error ?? "Could not save push subscription");
  }
}

async function ensurePushSubscription(publicKey: string) {
  const registration = await registerRadarServiceWorker();
  if (!registration) throw new Error("Could not register the service worker");
  await navigator.serviceWorker.ready;

  let subscription = await registration.pushManager.getSubscription();
  if (subscription && !subscriptionUsesKey(subscription, publicKey)) {
    await subscription.unsubscribe();
    subscription = null;
  }
  if (!subscription) {
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey),
    });
  }
  await savePushSubscription(subscription);
}

/** Customer-facing / public paths must never show Radar install or push prompts. */
function isEmployeeAppPath(pathname: string | null): boolean {
  if (!pathname) return false;
  const publicPrefixes = ["/portal", "/pay", "/book", "/booking", "/r/", "/login", "/api/"];
  return !publicPrefixes.some((prefix) => pathname === prefix || pathname.startsWith(prefix));
}

export function PwaProvider() {
  const pathname = usePathname();
  const { status, data: session } = useSession();
  const authenticated = status === "authenticated";
  const employeeSurface = isEmployeeAppPath(pathname);
  const [standalone, setStandalone] = useState(false);
  const [ios, setIos] = useState(false);
  const [showInstall, setShowInstall] = useState(false);
  const [showPushPrompt, setShowPushPrompt] = useState(false);
  const [pushState, setPushState] = useState<PushState>("loading");
  const [enabling, setEnabling] = useState(false);

  const canUseNotifications = useMemo(
    () =>
      typeof window !== "undefined" &&
      "Notification" in window &&
      "serviceWorker" in navigator &&
      "PushManager" in window,
    []
  );

  useEffect(() => {
    if (!employeeSurface) return;
    setStandalone(isStandaloneDisplay());
    setIos(isIosDevice());
    void registerRadarServiceWorker();
  }, [employeeSurface]);

  useEffect(() => {
    if (!authenticated || !employeeSurface || standalone || typeof window === "undefined") {
      setShowInstall(false);
      return;
    }
    if (localStorage.getItem(DISMISS_INSTALL_KEY) === "1") {
      setShowInstall(false);
      return;
    }
    const mobile = ios || /Android/i.test(navigator.userAgent);
    setShowInstall(mobile);
  }, [authenticated, employeeSurface, standalone, ios]);

  const refreshPushState = useCallback(async () => {
    if (!authenticated || !session?.user?.id || !employeeSurface || !canUseNotifications) {
      setPushState(canUseNotifications ? "loading" : "unsupported");
      return;
    }

    if (ios && !standalone) {
      setPushState("needs-install");
      return;
    }

    if (Notification.permission === "denied") {
      setPushState("denied");
      return;
    }

    try {
      const publicKey = await loadPushPublicKey();
      if (!publicKey) {
        setPushState("unconfigured");
        return;
      }
      if (Notification.permission === "granted") {
        await ensurePushSubscription(publicKey);
        setPushState("subscribed");
        return;
      }
      setPushState("prompt");
    } catch {
      setPushState("error");
    }
  }, [authenticated, employeeSurface, canUseNotifications, ios, standalone, session?.user?.id]);

  useEffect(() => {
    void refreshPushState();
    const refresh = () => void refreshPushState();
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") refresh();
    };
    const interval = window.setInterval(refresh, 15 * 60 * 1000);
    window.addEventListener("focus", refresh);
    window.addEventListener("online", refresh);
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener("focus", refresh);
      window.removeEventListener("online", refresh);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [refreshPushState]);

  useEffect(() => {
    if (!authenticated || !employeeSurface) {
      setShowPushPrompt(false);
      return;
    }
    setShowPushPrompt(
      pushState === "prompt" ||
        pushState === "needs-install" ||
        pushState === "unconfigured" ||
        pushState === "error"
    );
  }, [authenticated, employeeSurface, pushState]);

  async function enablePush() {
    if (!canUseNotifications) {
      toast.error("Push notifications are not supported in this browser");
      return;
    }
    if (ios && !standalone) {
      toast.message("Add Radar to your Home Screen first, then open it from there to enable alerts.");
      return;
    }

    setEnabling(true);
    try {
      const publicKey = await loadPushPublicKey();
      if (!publicKey) {
        setPushState("unconfigured");
        toast.error("Push notifications are not configured on the server yet");
        return;
      }

      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setPushState(permission === "denied" ? "denied" : "prompt");
        toast.error("Notification permission was not granted");
        return;
      }

      await ensurePushSubscription(publicKey);

      setPushState("subscribed");
      setShowPushPrompt(false);
      toast.success("Push notifications enabled");
    } catch (error) {
      console.error(error);
      setPushState("error");
      toast.error(error instanceof Error ? error.message : "Could not enable push notifications");
    } finally {
      setEnabling(false);
    }
  }

  if (!authenticated || !employeeSurface) return null;

  return (
    <>
      {showInstall ? (
        <div className="fixed inset-x-0 bottom-0 z-[90] border-t border-storm-ice/60 bg-white p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] shadow-lg sm:left-auto sm:right-4 sm:bottom-4 sm:max-w-sm sm:rounded-lg sm:border sm:pb-3">
          <div className="flex items-start gap-3">
            <div className="mt-0.5 rounded-md bg-storm-navy/10 p-2 text-storm-navy">
              <Share className="h-4 w-4" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-storm-navy">Install Radar</p>
              <p className="mt-1 text-xs text-muted-foreground">
                {ios
                  ? "Tap Share, then Add to Home Screen. Open Radar from the home screen for push alerts and a full-screen app experience."
                  : "Add Radar to your home screen for quicker access and push notifications."}
              </p>
            </div>
            <button
              type="button"
              className="rounded-md p-1 text-muted-foreground hover:bg-muted"
              aria-label="Dismiss"
              onClick={() => {
                localStorage.setItem(DISMISS_INSTALL_KEY, "1");
                setShowInstall(false);
              }}
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      ) : null}

      {showPushPrompt && !showInstall ? (
        <div className="fixed inset-x-0 bottom-0 z-[90] border-t border-storm-ice/60 bg-white p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] shadow-lg sm:left-auto sm:right-4 sm:bottom-4 sm:max-w-sm sm:rounded-lg sm:border sm:pb-3">
          <div className="flex items-start gap-3">
            <div className="mt-0.5 rounded-md bg-storm-navy/10 p-2 text-storm-navy">
              <Bell className="h-4 w-4" />
            </div>
            <div className="min-w-0 flex-1 space-y-2">
              <p className="text-sm font-medium text-storm-navy">Enable notifications</p>
              <p className="text-xs text-muted-foreground">
                {pushState === "needs-install"
                  ? "Install Radar to your Home Screen first, then open it from there to turn on alerts."
                  : pushState === "unconfigured"
                    ? "Background notifications need VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY configured on the server."
                    : pushState === "error"
                      ? "Radar could not verify this browser's background-notification subscription. Try again."
                      : "Get SMS, leads, and other alerts even when Radar is in the background or closed."}
              </p>
              {pushState === "prompt" || pushState === "error" ? (
                <Button size="sm" onClick={() => void enablePush()} disabled={enabling}>
                  {enabling
                    ? "Enabling…"
                    : pushState === "error"
                      ? "Retry notifications"
                      : "Enable notifications"}
                </Button>
              ) : null}
            </div>
            <button
              type="button"
              className="rounded-md p-1 text-muted-foreground hover:bg-muted"
              aria-label="Dismiss"
              onClick={() => {
                setShowPushPrompt(false);
              }}
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      ) : null}
    </>
  );
}
