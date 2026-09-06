import { conflict, notFound, validationFailed } from "../errors";
import * as languages from "../repositories/language";
import * as courses from "../repositories/course";
import { isAccentKey, nextAccentKey, type AccentKey } from "@/lib/tokens";
import type { Ctx } from "../repositories/base";

/**
 * Language service. Business rules live here; the repository only knows how to
 * read and write scoped rows.
 */

export type LanguageWithCourseCount = languages.LanguageRow & {
  courseCount: number;
};

export async function list(ctx: Ctx, includeArchived = false) {
  return languages.list(ctx, { includeArchived });
}

export async function get(ctx: Ctx, id: string) {
  const language = await languages.findById(ctx, id);
  if (!language) throw notFound("Language");
  return language;
}

export async function create(
  ctx: Ctx,
  input: {
    code: string;
    name: string;
    accentKey?: string | undefined;
    cefrLevel?: string | undefined;
  },
) {
  const existing = await languages.findByCode(ctx, input.code);
  if (existing) {
    throw conflict(`You already have ${existing.name} in your languages.`);
  }

  // Rotate through the six so a second language is visibly different from the
  // first, rather than colliding at random.
  let accentKey: AccentKey;
  if (input.accentKey && isAccentKey(input.accentKey)) {
    accentKey = input.accentKey;
  } else {
    accentKey = nextAccentKey(await languages.takenAccentKeys(ctx));
  }

  return languages.createWithDefaultCourse(ctx, {
    code: input.code,
    name: input.name,
    accentKey,
    cefrLevel: input.cefrLevel,
    position: await languages.nextPosition(ctx),
    // Named rather than "Default" because it is shown the moment a second
    // course exists, and "Default" tells the user nothing.
    defaultCourseName: "Self-study",
  });
}

export async function update(
  ctx: Ctx,
  id: string,
  data: {
    name?: string | undefined;
    accentKey?: string | undefined;
    cefrLevel?: string | null | undefined;
  },
) {
  if (data.accentKey && !isAccentKey(data.accentKey)) {
    throw validationFailed("Unknown accent", { field: "accentKey" });
  }
  const updated = await languages.update(ctx, id, data);
  if (!updated) throw notFound("Language");
  return updated;
}

export async function archive(ctx: Ctx, id: string) {
  if (!(await languages.archive(ctx, id))) throw notFound("Language");
}

export async function unarchive(ctx: Ctx, id: string) {
  if (!(await languages.unarchive(ctx, id))) throw notFound("Language");
}

/** Hard delete, refused unless the language has nothing in it. */
export async function remove(ctx: Ctx, id: string) {
  const documentCount = await languages.countDocuments(ctx, id);
  if (documentCount > 0) {
    throw conflict(
      `That language still has ${documentCount} document${documentCount === 1 ? "" : "s"}. Archive it instead, or delete the documents first.`,
      { documentCount },
    );
  }
  if (!(await languages.remove(ctx, id))) throw notFound("Language");
}

export async function reorder(ctx: Ctx, orderedIds: string[]) {
  await languages.reorder(ctx, orderedIds);
}

/** The UI hides courses entirely while a language has only its default one. */
export async function shouldShowCourses(
  ctx: Ctx,
  languageId: string,
): Promise<boolean> {
  return (await courses.countForLanguage(ctx, languageId)) > 1;
}
