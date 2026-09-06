import { z } from "zod";
import { ALLOWED_MIME_TYPES } from "../services/ingest/detect";

export const presignSchema = z.object({
  fileName: z.string().trim().min(1).max(255),
  mimeType: z.enum(ALLOWED_MIME_TYPES),
  byteSize: z.number().int().positive(),
  languageId: z.string().min(1),
  courseId: z.string().min(1).optional(),
  classSessionId: z.string().min(1).optional(),
  title: z.string().trim().max(200).optional(),
});

export const completeSchema = z.object({
  sourceFileId: z.string().min(1),
  checksumSha256: z
    .string()
    .regex(/^[a-f0-9]{64}$/i)
    .optional(),
});
