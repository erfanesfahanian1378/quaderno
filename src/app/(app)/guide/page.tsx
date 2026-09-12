import { requireUserPage } from "@/server/auth/guards";
import { SetupGuide } from "@/components/guide/SetupGuide";

export const metadata = { title: "Setup" };

/**
 * How to make this work properly on a phone.
 *
 * Everything here is about ONE rule that is impossible to guess at: a service
 * worker, push notifications, the microphone and `crypto.randomUUID` are not
 * merely blocked on a plain-http LAN address, they are ABSENT. Nothing errors
 * and nothing works, so the app looks broken in a way that reads as a bug
 * rather than as a browser policy.
 *
 * The certificate that fixes it was documented in a terminal banner, which is
 * the one place the person holding the phone is not looking. So it lives here
 * instead, with a link they can tap from the device that needs it.
 */
export default async function GuidePage() {
  await requireUserPage("/guide");
  return <SetupGuide />;
}
