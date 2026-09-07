import { requireUserPage } from "@/server/auth/guards";
import * as languages from "@/server/repositories/language";
import * as repo from "@/server/repositories/scheduled-class";
import { upcoming } from "@/server/services/study/schedule";
import { ScheduleView } from "@/components/study/ScheduleView";

export const metadata = { title: "Schedule" };
export const dynamic = "force-dynamic";

export default async function SchedulePage() {
  const ctx = await requireUserPage("/schedule");

  const [list, rules, occurrences] = await Promise.all([
    languages.list(ctx),
    repo.listAll(ctx),
    upcoming(ctx, 21),
  ]);

  return (
    <ScheduleView
      languages={list}
      rules={rules.map((rule) => ({
        ...rule,
        startsOn: rule.startsOn.toISOString(),
        endsOn: rule.endsOn?.toISOString() ?? null,
      }))}
      occurrences={occurrences}
    />
  );
}
