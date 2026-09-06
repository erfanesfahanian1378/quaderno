import { ResetForm } from "./ResetForm";

export const metadata = { title: "Choose a new password" };

export default async function ResetPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;

  if (!token) {
    return (
      <>
        <h1 className="text-h1 text-ink">That link is incomplete</h1>
        <p className="mt-2 text-body text-ink-2">
          Request a new one from the sign-in page.
        </p>
      </>
    );
  }

  return (
    <>
      <h1 className="text-h1 text-ink">Choose a new password</h1>
      <p className="mt-2 text-body text-ink-2">
        This signs you out everywhere else.
      </p>
      <ResetForm token={token} />
    </>
  );
}
