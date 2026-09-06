import { z } from "zod";
import { ACCENT_KEYS } from "@/lib/tokens";

const CEFR = ["A1", "A2", "B1", "B2", "C1", "C2"] as const;

export const createLanguageSchema = z.object({
  code: z
    .string()
    .trim()
    .toLowerCase()
    .min(2)
    .max(8)
    .regex(/^[a-z-]+$/, "Use an ISO 639-1 code such as it or fr"),
  name: z.string().trim().min(1).max(60),
  accentKey: z.enum(ACCENT_KEYS).optional(),
  cefrLevel: z.enum(CEFR).optional(),
});

export const updateLanguageSchema = z.object({
  name: z.string().trim().min(1).max(60).optional(),
  accentKey: z.enum(ACCENT_KEYS).optional(),
  cefrLevel: z.enum(CEFR).nullable().optional(),
});

export const reorderLanguagesSchema = z.object({
  orderedIds: z.array(z.string().min(1)).min(1).max(50),
});

export const createCourseSchema = z.object({
  languageId: z.string().min(1),
  name: z.string().trim().min(1).max(80),
  teacher: z.string().trim().max(80).optional(),
  institution: z.string().trim().max(80).optional(),
  startsOn: z.coerce.date().optional(),
  endsOn: z.coerce.date().optional(),
});

export const createClassSessionSchema = z.object({
  languageId: z.string().min(1),
  courseId: z.string().min(1).optional(),
  date: z.coerce.date(),
  title: z.string().trim().min(1).max(120),
  topics: z.array(z.string().trim().min(1).max(40)).max(12).optional(),
  summary: z.string().trim().max(4000).optional(),
  attended: z.boolean().optional(),
});

export const updateClassSessionSchema = createClassSessionSchema
  .partial()
  .omit({ languageId: true });
