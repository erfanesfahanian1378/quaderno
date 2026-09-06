import Link from "next/link";
import { ForgotForm } from "./ForgotForm";

export const metadata = { title: "Reset your password" };

export default function ForgotPage() {
  return (
    <>
      <h1 className="text-h1 text-ink">Reset your password</h1>
      <p className="mt-2 text-body text-ink-2">
        We will send a link to your address.
      </p>

      <ForgotForm />

      <p className="mt-6 text-body-sm text-ink-2">
        <Link href="/sign-in" className="text-accent underline">
          Back to sign in
        </Link>
      </p>
    </>
  );
}
