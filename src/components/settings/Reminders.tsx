"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api-client";
import { Banner, Button } from "@/components/ui";
import { cn } from "@/lib/cn";

/**
 * Turning reminders on, which is three separate things the browser keeps
 * separate and users do not.
 *
 *   1. Notification PERMISSION, granted per site and revocable at any time.
 *   2. A push SUBSCRIPTION, per browser, stored on the server.
 *   3. What you actually want to be reminded about.
 *
 * They fail independently and the failures look identical from the outside —
 * nothing arrives. So each one is reported separately, and there is a button
 * that sends a real notification, because proving delivery beats explaining it.
 */
const CLASS_OPTIONS = [5, 10, 15, 30, 60];

type Support = "checking" | "ready" | "insecure" | "unsupported";

export function Reminders({
  vapidPublicKey,
  initialClassMinutes,
  initialStudyAt,
}: {
  /** Null when the server has no VAPID keys — reminders cannot work at all. */
  vapidPublicKey: string | null;
  initialClassMinutes: number | null;
  initialStudyAt: string | null;
}) {
  const [support, setSupport] = useState<Support>("checking");
  const [permission, setPermission] =
    useState<NotificationPermission>("default");
  const [subscribed, setSubscribed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const [classMinutes, setClassMinutes] = useState(initialClassMinutes);
  const [studyAt, setStudyAt] = useState(initialStudyAt);

  useEffect(() => {
    if (typeof window === "undefined") return;

    if (!("Notification" in window) || !("serviceWorker" in navigator)) {
      setSupport("unsupported");
      return;
    }
    /*
     * Push needs a secure context, the same rule that governs
     * crypto.randomUUID, getUserMedia and the service worker itself. On a
     * plain-http LAN address the APIs are simply absent, and saying so is
     * better than a button that does nothing.
     */
    if (!window.isSecureContext || !("PushManager" in window)) {
      setSupport("insecure");
      return;
    }

    setSupport("ready");
    setPermission(Notification.permission);

    void navigator.serviceWorker.ready
      .then((registration) => registration.pushManager.getSubscription())
      .then((existing) => setSubscribed(Boolean(existing)))
      .catch(() => setSubscribed(false));
  }, []);

  const savePreference = useCallback(async (body: Record<string, unknown>) => {
    const result = await api.patch("/api/me", body);
    if (!result.ok) setError(result.error.message);
  }, []);

  const enable = async () => {
    if (!vapidPublicKey) return;

    setBusy(true);
    setError(null);
    setNote(null);

    try {
      const granted = await Notification.requestPermission();
      setPermission(granted);

      if (granted !== "granted") {
        setError(
          granted === "denied"
            ? "This browser is blocking notifications for the site. Allow them in its site settings, then try again."
            : "Permission was not granted.",
        );
        return;
      }

      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.subscribe({
        // Required, and rightly: a push that cannot be shown to the user is
        // a channel for silent background work, and browsers refuse it.
        userVisibleOnly: true,
        applicationServerKey: toUint8Array(vapidPublicKey),
      });

      const json = subscription.toJSON() as {
        endpoint?: string;
        keys?: { p256dh?: string; auth?: string };
      };

      const result = await api.post("/api/push/subscribe", {
        endpoint: json.endpoint,
        keys: { p256dh: json.keys?.p256dh, auth: json.keys?.auth },
      });

      if (!result.ok) {
        setError(result.error.message);
        return;
      }

      setSubscribed(true);
      setNote("This browser will now get reminders.");
    } catch (caught) {
      setError(
        caught instanceof Error
          ? `Could not turn them on: ${caught.message}`
          : "Could not turn them on.",
      );
    } finally {
      setBusy(false);
    }
  };

  const disable = async () => {
    setBusy(true);
    setError(null);
    setNote(null);

    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();

      if (subscription) {
        // Tell the server BEFORE unsubscribing: once the endpoint is gone
        // from the browser there is nothing left to identify the row by.
        // The endpoint goes in the query string: `delete` sends no body, and
        // a DELETE with one is awkward anyway.
        await api.delete(
          `/api/push/subscribe?endpoint=${encodeURIComponent(subscription.endpoint)}`,
        );
        await subscription.unsubscribe();
      }

      setSubscribed(false);
      setNote("This browser will not get reminders.");
    } finally {
      setBusy(false);
    }
  };

  const test = async () => {
    setBusy(true);
    setError(null);
    setNote(null);

    const result = await api.post("/api/push/test");
    setBusy(false);

    if (!result.ok) setError(result.error.message);
    else setNote("Sent. It should appear in a second or two.");
  };

  if (support === "checking") return null;

  if (!vapidPublicKey) {
    return (
      <Banner tone="info">
        Reminders are not set up on this server. Adding{" "}
        <code className="px-1">VAPID_PUBLIC_KEY</code> and{" "}
        <code className="px-1">VAPID_PRIVATE_KEY</code> turns them on — see{" "}
        <code className="px-1">.env.example</code>.
      </Banner>
    );
  }

  if (support === "unsupported") {
    return (
      <Banner tone="info">
        This browser cannot show notifications, so reminders are unavailable
        here. They will still work on another device.
      </Banner>
    );
  }

  if (support === "insecure") {
    return (
      <Banner tone="info">
        Reminders need a secure connection, so they do not work over a plain{" "}
        <code className="px-1">http://</code> address on your network. Open the
        app over https, or on this device, to turn them on.
      </Banner>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {error ? <Banner tone="danger">{error}</Banner> : null}
      {note ? <Banner tone="info">{note}</Banner> : null}

      <div className="flex flex-wrap items-center gap-2">
        {subscribed ? (
          <>
            <span className="inline-flex items-center gap-1.5 text-body-sm text-ink">
              <span
                aria-hidden="true"
                className="size-2 rounded-full bg-accent"
              />
              On for this browser
            </span>
            <Button
              size="sm"
              variant="ghost"
              loading={busy}
              onClick={() => void test()}
            >
              Send a test one
            </Button>
            <Button
              size="sm"
              variant="ghost"
              loading={busy}
              onClick={() => void disable()}
            >
              Turn off here
            </Button>
          </>
        ) : (
          <Button size="sm" loading={busy} onClick={() => void enable()}>
            Turn on reminders
          </Button>
        )}
      </div>

      {permission === "denied" ? (
        <p className="text-caption text-ink-3">
          Notifications are blocked for this site in the browser&apos;s own
          settings, so the button above cannot ask again. Allow them there
          first.
        </p>
      ) : null}

      {/* The preferences are per ACCOUNT, so they apply to every browser. */}
      <div className="flex flex-col gap-3 border-t border-hairline pt-4">
        <div>
          <p className="text-label text-ink">Before a class</p>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {CLASS_OPTIONS.map((minutes) => (
              <Choice
                key={minutes}
                selected={classMinutes === minutes}
                onSelect={() => {
                  setClassMinutes(minutes);
                  void savePreference({ notifyClassMinutes: minutes });
                }}
              >
                {minutes} min
              </Choice>
            ))}
            <Choice
              selected={classMinutes === null}
              onSelect={() => {
                setClassMinutes(null);
                void savePreference({ notifyClassMinutes: null });
              }}
            >
              Off
            </Choice>
          </div>
        </div>

        <div>
          <p className="text-label text-ink">A daily nudge to study</p>
          <div className="mt-1.5 flex flex-wrap items-center gap-2">
            <input
              type="time"
              value={studyAt ?? ""}
              onChange={(event) => {
                const value = event.target.value || null;
                setStudyAt(value);
                void savePreference({ notifyStudyAt: value });
              }}
              className="h-9 rounded-sm border border-hairline-strong bg-surface px-2 text-body text-ink"
            />
            {studyAt ? (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setStudyAt(null);
                  void savePreference({ notifyStudyAt: null });
                }}
              >
                Off
              </Button>
            ) : (
              <span className="text-caption text-ink-3">Off</span>
            )}
          </div>
          <p className="mt-1 text-caption text-ink-3">
            In your own time zone. Skipped on a day you have already studied and
            have no cards waiting.
          </p>
        </div>
      </div>
    </div>
  );
}

function Choice({
  selected,
  onSelect,
  children,
}: {
  selected: boolean;
  onSelect: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onSelect}
      className={cn(
        "h-8 rounded-full border px-3 text-caption transition-colors duration-[120ms]",
        selected
          ? "border-transparent bg-accent/15 text-accent"
          : "border-hairline text-ink-2 hover:bg-subtle hover:text-ink",
      )}
    >
      {children}
    </button>
  );
}

/**
 * The VAPID public key, base64url → bytes.
 *
 * `applicationServerKey` will not take the string form, and the key is
 * base64URL (`-` and `_`) while `atob` speaks base64 (`+` and `/`) and wants
 * padding. Getting this wrong produces an opaque "InvalidCharacterError" that
 * says nothing about keys.
 */
function toUint8Array(base64Url: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64Url.length % 4)) % 4);
  const base64 = (base64Url + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);

  // Backed by a plain ArrayBuffer, which is what `applicationServerKey`
  // accepts — a Uint8Array over a SharedArrayBuffer is not a BufferSource.
  const bytes = new Uint8Array(new ArrayBuffer(raw.length));
  for (let index = 0; index < raw.length; index += 1) {
    bytes[index] = raw.charCodeAt(index);
  }
  return bytes;
}
