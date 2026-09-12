"use client";

import { useEffect, useState } from "react";
import { offlineSupport } from "@/lib/offline/register";
import { Banner, Card } from "@/components/ui";
import { cn } from "@/lib/cn";

/**
 * The certificate, and what to do with it, on the device that needs it.
 *
 * Everything here exists because of one rule that is impossible to guess at:
 * service workers, push, the microphone and `crypto.randomUUID` are not
 * merely blocked on a plain-http LAN address, they are ABSENT. Nothing errors
 * and nothing works, so the app looks broken in a way that reads as a bug
 * rather than a browser policy.
 *
 * The fix was documented in a terminal banner, which is the one place the
 * person holding the phone is not looking. It lives here instead, written for
 * someone holding a phone.
 */
export function SetupGuide() {
  const [support, setSupport] =
    useState<ReturnType<typeof offlineSupport>>("unsupported");
  const [origin, setOrigin] = useState("");
  const [platform, setPlatform] = useState<"ios" | "android" | "desktop">(
    "desktop",
  );

  useEffect(() => {
    setSupport(offlineSupport());
    setOrigin(window.location.origin);

    const ua = navigator.userAgent;
    if (/iPhone|iPad|iPod/i.test(ua)) setPlatform("ios");
    else if (/Android/i.test(ua)) setPlatform("android");
  }, []);

  /*
   * Built from the current host rather than hardcoded.
   *
   * The certificate is served by the HTTPS proxy on its own port, not by this
   * app, so the link is right whichever machine is running `pnpm https` — and
   * an IP typed into a guide is wrong the first time the router hands out a
   * different one.
   */
  const host = origin.replace(/^https?:\/\//, "").replace(/:\d+$/, "");
  const certUrl = host ? `https://${host}:3443/mkcert-root.crt` : "";

  const secure = support === "ready";

  return (
    <div className="flex max-w-[70ch] flex-col gap-6">
      <header>
        <h1 className="font-reading text-display text-ink">Setup</h1>
        <p className="mt-1 text-body-sm text-ink-2">
          Getting offline reading, reminders and recording working on a phone.
        </p>
      </header>

      {secure ? (
        <Banner tone="success">
          This connection is secure, so everything works here already. Nothing
          on this page needs doing on this device.
        </Banner>
      ) : (
        <Banner tone="warning">
          This device is on a plain <code>http://</code> address. Offline
          reading, reminders and voice recording are switched off by the browser
          here — not by the app.
        </Banner>
      )}

      <section className="flex flex-col gap-2">
        <h2 className="text-h3 text-ink">Why this is needed</h2>
        <p className="text-body-sm text-ink-2">
          Browsers only allow the features this app depends on in a{" "}
          <strong>secure context</strong>: an <code>https://</code> address, or{" "}
          <code>localhost</code>. On a plain address such as{" "}
          <code>http://192.168.1.20:3000</code> they are not refused with an
          error — they are simply <em>absent</em>. That is why the app looks
          like it is failing instead of telling you anything.
        </p>
        <p className="text-body-sm text-ink-2">
          The fix is to trust one certificate, once, per device. After that the
          phone treats the computer running Quaderno as a real secure site.
        </p>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-h3 text-ink">
          Step 1 — start the secure front door
        </h2>
        <Card className="p-4">
          <p className="text-body-sm text-ink-2">
            On the computer running Quaderno, in a second terminal:
          </p>
          <pre className="mt-2 overflow-x-auto rounded-sm bg-inset px-3 py-2 text-caption text-ink">
            pnpm https
          </pre>
          <p className="mt-2 text-body-sm text-ink-2">
            Leave it running — it is what serves the certificate below and the
            secure address in step 3.
          </p>
        </Card>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-h3 text-ink">Step 2 — install the certificate</h2>
        <Card className="flex flex-col gap-3 p-4">
          <p className="text-body-sm text-ink-2">
            Open this <strong>on the phone or tablet itself</strong>. A
            certificate installed on the laptop does nothing for the phone.
          </p>

          {certUrl ? (
            <a
              href={certUrl}
              className="inline-flex h-11 w-fit items-center rounded-sm bg-accent px-4 text-label text-accent-on"
            >
              Download the certificate
            </a>
          ) : null}

          <p className="text-caption text-ink-3">
            If the link does not open, type it in by hand:{" "}
            <code className="break-all">
              {certUrl || "https://<your-computer-ip>:3443/mkcert-root.crt"}
            </code>
          </p>

          {/*
            One platform at a time. iOS in particular has a second screen most
            people never find, and burying it in a wall of three sets of steps
            is how it gets missed.
          */}
          <div className="flex flex-wrap gap-1.5">
            {(
              [
                ["ios", "iPhone / iPad"],
                ["android", "Android"],
                ["desktop", "Mac / Windows"],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                aria-pressed={platform === id}
                onClick={() => setPlatform(id)}
                className={cn(
                  "h-8 rounded-sm px-2.5 text-caption transition-colors duration-[120ms]",
                  platform === id
                    ? "bg-subtle text-ink"
                    : "text-ink-2 hover:bg-subtle",
                )}
              >
                {label}
              </button>
            ))}
          </div>

          {platform === "ios" ? (
            <ol className="flex list-decimal flex-col gap-1.5 pl-5 text-body-sm text-ink-2">
              <li>
                Tap the button above. Safari says a profile was downloaded.
              </li>
              <li>
                Open <strong>Settings</strong>. The profile is waiting at the
                top, under your name, as “Profile Downloaded”. Tap it, then
                Install.
              </li>
              <li>
                Then the part everyone misses:{" "}
                <strong>
                  Settings → General → About → Certificate Trust Settings
                </strong>{" "}
                and turn the switch on for <code>mkcert</code>. Without it the
                certificate is installed but not trusted, and nothing changes.
              </li>
            </ol>
          ) : platform === "android" ? (
            <ol className="flex list-decimal flex-col gap-1.5 pl-5 text-body-sm text-ink-2">
              <li>Tap the button above to download the file.</li>
              <li>
                Open <strong>Settings</strong> and search it for “certificate” —
                the path varies by manufacturer, but it is usually Security →
                Encryption &amp; credentials → Install a certificate →{" "}
                <strong>CA certificate</strong>. Pick the file you just
                downloaded.
              </li>
              <li>
                Android warns that someone could monitor your traffic. That
                warning is right in general and expected here: this certificate
                was generated on your own computer and never leaves your
                network.
              </li>
            </ol>
          ) : (
            <ol className="flex list-decimal flex-col gap-1.5 pl-5 text-body-sm text-ink-2">
              <li>
                On the computer running Quaderno there is nothing to do.{" "}
                <code>mkcert -install</code> already trusted it, and{" "}
                <code>localhost</code> is a secure context regardless.
              </li>
              <li>
                On a different computer, download the file and add it to the
                system trust store: Keychain Access on a Mac — drag it into{" "}
                <strong>System</strong>, then set it to “Always Trust” — or{" "}
                <strong>
                  certmgr.msc → Trusted Root Certification Authorities
                </strong>{" "}
                on Windows.
              </li>
            </ol>
          )}
        </Card>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-h3 text-ink">Step 3 — open the secure address</h2>
        <Card className="p-4">
          <p className="text-body-sm text-ink-2">
            On the phone, go to{" "}
            <code className="break-all">
              https://{host || "<your-computer-ip>"}:3443
            </code>
            . Note the <strong>s</strong>, and <strong>3443</strong> rather than
            3000. Add that to your home screen and offline reading, reminders
            and recording all work.
          </p>
          <p className="mt-2 text-caption text-ink-3">
            All of this is only for running Quaderno from your own computer.
            Deployed to a real domain the certificate is an ordinary public one
            and there is nothing to install.
          </p>
        </Card>
      </section>
    </div>
  );
}
