import { z } from "zod";

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
  endsOn: z.coerce.date().nullable().optional(),
  active: z.boolean().optional(),
});

export const confirmSchema = z.object({ attended: z.boolean() });
