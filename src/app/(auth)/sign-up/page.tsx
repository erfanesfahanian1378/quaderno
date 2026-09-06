import Link from "next/link";
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
