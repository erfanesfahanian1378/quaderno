import Link from "next/link";
import { redirect } from "next/navigation";
import { currentUserId } from "@/server/auth/guards";
import { SignInForm } from "./SignInForm";

export const metadata = { title: "Sign in" };

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  if (await currentUserId()) redirect("/dashboard");
  const params = await searchParams;

  return (
    <>
      <h1 className="text-h1 text-ink">Welcome back</h1>
      <p className="mt-2 text-body text-ink-2">Pick up where you left off.</p>

      <SignInForm
        next={params.next ?? "/dashboard"}
        initialError={params.error ? "Email or password is incorrect." : null}
      />

      <p className="mt-6 text-body-sm text-ink-2">
        No account yet?{" "}
        <Link href="/sign-up" className="text-accent underline">
          Create one
        </Link>
      </p>
    </>
  );
}
