"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
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
const DISMISS_PUSH_KEY = "radar-pwa-push-dismissed";

type PushState = "loading" | "unsupported" | "needs-install" | "prompt" | "subscribed" | "denied";

export function PwaProvider() {
  const { status } = useSession();
  const authenticated = status === "authenticated";
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
    setStandalone(isStandaloneDisplay());
    setIos(isIosDevice());
    void registerRadarServiceWorker();
  }, []);

  useEffect(() => {
    if (!authenticated || standalone || typeof window === "undefined") {
      setShowInstall(false);
      return;
    }
    if (localStorage.getItem(DISMISS_INSTALL_KEY) === "1") {
      setShowInstall(false);
      return;
    }
    // iOS cannot install programmatically — guide Share → Add to Home Screen.
    // Also show a light tip on other mobile browsers.
    const mobile = ios || /Android/i.test(navigator.userAgent);
    setShowInstall(mobile);
  }, [authenticated, standalone, ios]);

  const refreshPushState = useCallback(async () => {
    if (!authenticated || !canUseNotifications) {
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
      const registration = await navigator.serviceWorker.ready;
      const existing = await registration.pushManager.getSubscription();
      if (existing) {
        setPushState("subscribed");
        return;
      }
      setPushState("prompt");
    } catch {
      setPushState("unsupported");
    }
  }, [authenticated, canUseNotifications, ios, standalone]);

  useEffect(() => {
    void refreshPushState();
  }, [refreshPushState]);

  useEffect(() => {
    if (!authenticated) {
      setShowPushPrompt(false);
      return;
    }
    if (localStorage.getItem(DISMISS_PUSH_KEY) === "1") {
      setShowPushPrompt(false);
      return;
    }
    setShowPushPrompt(pushState === "prompt" || pushState === "needs-install");
  }, [authenticated, pushState]);

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
      const keyRes = await fetch("/api/push/vapid-public-key");
      const keyData = (await keyRes.json()) as {
        configured?: boolean;
        publicKey?: string | null;
      };
      if (!keyData.configured || !keyData.publicKey) {
        toast.error("Push notifications are not configured on the server yet");
        return;
      }

      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setPushState(permission === "denied" ? "denied" : "prompt");
        toast.error("Notification permission was not granted");
        return;
      }

      const registration = await registerRadarServiceWorker();
      if (!registration) {
        toast.error("Could not register the service worker");
        return;
      }
      await navigator.serviceWorker.ready;

      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(keyData.publicKey),
      });

      const json = subscription.toJSON();
      const res = await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          endpoint: json.endpoint,
          keys: json.keys,
        }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        toast.error(data.error ?? "Could not save push subscription");
        return;
      }

      setPushState("subscribed");
      setShowPushPrompt(false);
      toast.success("Push notifications enabled");
    } catch (error) {
      console.error(error);
      toast.error("Could not enable push notifications");
    } finally {
      setEnabling(false);
    }
  }

  if (!authenticated) return null;

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
                  : "Get SMS, leads, and other alerts even when Radar is in the background."}
              </p>
              {pushState === "prompt" ? (
                <Button size="sm" onClick={() => void enablePush()} disabled={enabling}>
                  {enabling ? "Enabling…" : "Enable notifications"}
                </Button>
              ) : null}
            </div>
            <button
              type="button"
              className="rounded-md p-1 text-muted-foreground hover:bg-muted"
              aria-label="Dismiss"
              onClick={() => {
                localStorage.setItem(DISMISS_PUSH_KEY, "1");
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
