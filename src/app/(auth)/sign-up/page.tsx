import Link from "next/link";
import { GoogleButton, OrDivider } from "@/components/auth/GoogleButton";
import { googleEnabled } from "@/server/auth/config";
import { redirect } from "next/navigation";
import { currentUserId } from "@/server/auth/guards";
import { SignUpForm } from "./SignUpForm";

export const metadata = { title: "Create your account" };

export default async function SignUpPage() {
  if (await currentUserId()) redirect("/dashboard");

  return (
    <>
      <h1 className="text-h1 text-ink">Create your account</h1>
      <p className="mt-2 text-body text-ink-2">
        One place for your handouts, your notes and your hours.
      </p>

      {googleEnabled() ? (
        <div className="mt-6 flex flex-col gap-4">
          <GoogleButton next="/onboarding" label="Sign up with Google" />
          <OrDivider />
        </div>
      ) : null}

      <SignUpForm />

      <p className="mt-6 text-body-sm text-ink-2">
        Already have an account?{" "}
        <Link href="/sign-in" className="text-accent underline">
          Sign in
        </Link>
      </p>
    </>
  );
}
