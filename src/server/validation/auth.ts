import { z } from "zod";

/**
 * Auth input schemas. CLAUDE.md rule #7: validate every input at the boundary
 * with Zod, and infer client types from the same schemas so the form and the
 * handler can never disagree about what a valid password is.
 */

export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(3)
  .max(254)
  .email("That does not look like an email address");

/**
 * 8 characters is the floor, not the policy. The real gate is the zxcvbn
 * score check in the register service — length rules push people towards
 * "Password1!" while a strength estimate catches it.
 */
export const passwordSchema = z
  .string()
  .min(8, "At least 8 characters")
  .max(200, "That is longer than we can hash");

export const registerSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  name: z.string().trim().min(1).max(80).optional(),
});

export const signInSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, "Enter your password"),
});

export const forgotPasswordSchema = z.object({ email: emailSchema });

export const resetPasswordSchema = z.object({
  token: z.string().min(16),
  password: passwordSchema,
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: passwordSchema,
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type SignInInput = z.infer<typeof signInSchema>;
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;
