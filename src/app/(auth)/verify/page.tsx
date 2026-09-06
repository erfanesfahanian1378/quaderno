import Link from "next/link";
import { verifyEmail } from "@/server/services/auth";
import { Banner } from "@/components/ui";

export const metadata = { title: "Confirm your email" };

export default async function VerifyPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;
  const verified = token ? await verifyEmail(token) : false;

  return (
    <>
      <h1 className="text-h1 text-ink">
        {verified ? "Address confirmed" : "Confirm your email"}
      </h1>

      <div className="mt-6">
        {verified ? (
          <Banner tone="success">Thanks — your address is confirmed.</Banner>
        ) : token ? (
          <Banner tone="warning">
            That link has expired or has already been used. Sign in and we will
            send another.
          </Banner>
        ) : (
          <Banner tone="info">
            Check your inbox for the confirmation link. In development it is
            printed in the terminal running <code>pnpm dev</code>.
          </Banner>
        )}
      </div>

      <p className="mt-6 text-body-sm text-ink-2">
        <Link href="/dashboard" className="text-accent underline">
          Go to your dashboard
        </Link>
      </p>
    </>
  );
}
