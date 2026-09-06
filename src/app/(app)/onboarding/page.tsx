import { redirect } from "next/navigation";
import { requireUserPage } from "@/server/auth/guards";
import * as languages from "@/server/repositories/language";
import { OnboardingFlow } from "./OnboardingFlow";

export const metadata = { title: "Set up" };

export default async function OnboardingPage() {
  const ctx = await requireUserPage("/onboarding");
  const existing = await languages.list(ctx);

  // Resumable and skippable: someone who already has a language does not get
  // trapped here.
  if (existing.length > 0) redirect("/dashboard");

  return <OnboardingFlow />;
}
