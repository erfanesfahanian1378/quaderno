import { z } from "zod";
import { parseMeetingUrl } from "@/lib/meeting-url";

/**
 * A meeting link, normalised and checked at the boundary.
 *
 * `transform` rather than `refine` so what reaches the database is the parsed
 * absolute URL, not the raw string — a value that has been through `new URL()`
 * and had its scheme checked against an allowlist. This field ends up as an
 * `href` on the dashboard, so `javascript:` and `data:` must never get past
 * here. See src/lib/meeting-url.ts.
 */
const meetingUrlSchema = z
  .string()
  .trim()
  .max(500)
  .transform((value, ctx) => {
    if (value === "") return null;
    const parsed = parseMeetingUrl(value);
    if (!parsed) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "That does not look like a meeting link.",
      });
      return z.NEVER;
    }
    return parsed.url;
  });

export const createScheduledClassSchema = z.object({
  languageId: z.string().min(1),
  courseId: z.string().min(1).optional(),
  title: z.string().trim().min(1).max(120),
  /** 0 = Monday, matching the BYDAY order the service builds. */
  weekdays: z.array(z.number().int().min(0).max(6)).min(1).max(7),
  startTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use HH:MM"),
  durationMin: z.number().int().min(5).max(600),
  timeZone: z.string().min(1).max(64).optional(),
  location: z.string().trim().max(120).optional(),
  meetingUrl: meetingUrlSchema.nullable().optional(),
  startsOn: z.coerce.date(),
  endsOn: z.coerce.date().optional(),
});

export const updateScheduledClassSchema = z.object({
  title: z.string().trim().min(1).max(120).optional(),
  startTime: z
    .string()
    .regex(/^([01]\d|2[0-3]):[0-5]\d$/)
    .optional(),
  durationMin: z.number().int().min(5).max(600).optional(),
  location: z.string().trim().max(120).nullable().optional(),
  meetingUrl: meetingUrlSchema.nullable().optional(),
  endsOn: z.coerce.date().nullable().optional(),
  active: z.boolean().optional(),
});

export const confirmSchema = z.object({ attended: z.boolean() });
