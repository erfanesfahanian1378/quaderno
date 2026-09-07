import { prisma } from "./client";
import {
  cursorArgs,
  toPage,
  type Ctx,
  type CursorPage,
  type Paginated,
} from "./base";

/**
 * Document repository.
 *
 * Documents are just ids, which makes them the top IDOR risk in the app
 * (ARCHITECTURE.md §7). Every function here scopes on `ctx.userId`, and a
 * document owned by someone else comes back as `null` so the service can
 * return 404 — never 403.
 */

const CARD_FIELDS = {
  id: true,
  languageId: true,
  courseId: true,
  classSessionId: true,
  folderId: true,
  title: true,
  origin: true,
  status: true,
  leafCount: true,
  thumbnailKey: true,
  tags: true,
  starred: true,
  lastOpenedAt: true,
  createdAt: true,
  updatedAt: true,
} as const;

export type DocumentCard = {
  id: string;
  languageId: string;
  courseId: string | null;
  classSessionId: string | null;
  folderId: string | null;
  title: string;
  origin: "UPLOAD" | "NATIVE";
  status: "PENDING" | "CONVERTING" | "READY" | "FAILED";
  leafCount: number;
  thumbnailKey: string | null;
  tags: string[];
  starred: boolean;
  lastOpenedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

export type ListFilter = {
  languageId?: string | undefined;
  courseId?: string | undefined;
  classSessionId?: string | undefined;
  tag?: string | undefined;
  starred?: boolean | undefined;
  query?: string | undefined;
  /** `null` is the language's top level; `undefined` is every folder. */
  folderId?: string | null | undefined;
};

export async function list(
  ctx: Ctx,
  filter: ListFilter,
  page: CursorPage,
  sort: "recent" | "title" | "created" = "recent",
): Promise<Paginated<DocumentCard>> {
  const orderBy =
    sort === "title"
      ? ([{ title: "asc" }, { id: "asc" }] as const)
      : sort === "created"
        ? ([{ createdAt: "desc" }, { id: "desc" }] as const)
        : ([{ updatedAt: "desc" }, { id: "desc" }] as const);

  const rows = await prisma.document.findMany({
    where: {
      userId: ctx.userId,
      deletedAt: null,
      ...(filter.languageId ? { languageId: filter.languageId } : {}),
      ...(filter.courseId ? { courseId: filter.courseId } : {}),
      ...(filter.classSessionId
        ? { classSessionId: filter.classSessionId }
        : {}),
      ...(filter.tag ? { tags: { has: filter.tag } } : {}),
      /*
       * `folderId: null` means the top level and is a real filter, so it is
       * checked with `!== undefined` rather than for truthiness — the usual
       * shorthand would silently show the whole language at the root.
       */
      ...(filter.folderId !== undefined ? { folderId: filter.folderId } : {}),
      ...(filter.starred != null ? { starred: filter.starred } : {}),
      ...(filter.query
        ? { title: { contains: filter.query, mode: "insensitive" as const } }
        : {}),
    },
    select: CARD_FIELDS,
    orderBy: [...orderBy],
    ...cursorArgs(page),
  });

  return toPage(rows, page);
}

/** Serves the dashboard's "Continue where you left off" row. */
export async function recentlyOpened(
  ctx: Ctx,
  limit = 6,
): Promise<DocumentCard[]> {
  return prisma.document.findMany({
    where: { userId: ctx.userId, deletedAt: null, lastOpenedAt: { not: null } },
    select: CARD_FIELDS,
    orderBy: { lastOpenedAt: "desc" },
    take: limit,
  });
}

export async function findById(
  ctx: Ctx,
  id: string,
): Promise<DocumentCard | null> {
  return prisma.document.findFirst({
    where: { id, userId: ctx.userId, deletedAt: null },
    select: CARD_FIELDS,
  });
}

/** The viewer's payload: document + ordered leaves + source files. */
export async function findFull(ctx: Ctx, id: string) {
  return prisma.document.findFirst({
    where: { id, userId: ctx.userId, deletedAt: null },
    select: {
      ...CARD_FIELDS,
      sourceFiles: {
        select: {
          id: true,
          originalName: true,
          mimeType: true,
          byteSize: true,
          storageKey: true,
          pdfStorageKey: true,
          pdfPageCount: true,
          conversionEngine: true,
          conversionMs: true,
          hasTextLayer: true,
          ocrApplied: true,
          createdAt: true,
        },
      },
      leaves: {
        where: { hidden: false },
        orderBy: { position: "asc" },
        select: {
          id: true,
          position: true,
          kind: true,
          sourceFileId: true,
          sourcePageIndex: true,
          notePageId: true,
          label: true,
          rotation: true,
          notePage: {
            select: {
              id: true,
              content: true,
              format: true,
              pageSize: true,
              orientation: true,
              updatedAt: true,
            },
          },
        },
      },
    },
  });
}

export async function create(
  ctx: Ctx,
  input: {
    languageId: string;
    courseId?: string | undefined;
    classSessionId?: string | undefined;
    title: string;
    origin: "UPLOAD" | "NATIVE";
    status?: "PENDING" | "CONVERTING" | "READY" | "FAILED" | undefined;
  },
): Promise<DocumentCard> {
  return prisma.document.create({
    data: {
      userId: ctx.userId,
      languageId: input.languageId,
      courseId: input.courseId ?? null,
      classSessionId: input.classSessionId ?? null,
      title: input.title,
      origin: input.origin as never,
      status: (input.status ?? "PENDING") as never,
    },
    select: CARD_FIELDS,
  });
}

export async function update(
  ctx: Ctx,
  id: string,
  data: {
    title?: string | undefined;
    tags?: string[] | undefined;
    starred?: boolean | undefined;
    courseId?: string | null | undefined;
    classSessionId?: string | null | undefined;
    folderId?: string | null | undefined;
  },
): Promise<DocumentCard | null> {
  const result = await prisma.document.updateMany({
    where: { id, userId: ctx.userId, deletedAt: null },
    data,
  });
  if (result.count === 0) return null;
  return findById(ctx, id);
}

export async function markOpened(ctx: Ctx, id: string): Promise<void> {
  await prisma.document.updateMany({
    where: { id, userId: ctx.userId, deletedAt: null },
    data: { lastOpenedAt: new Date() },
  });
}

/** Soft delete — 30-day trash. Users delete class notes by accident. */
export async function softDelete(ctx: Ctx, id: string): Promise<boolean> {
  const result = await prisma.document.updateMany({
    where: { id, userId: ctx.userId, deletedAt: null },
    data: { deletedAt: new Date() },
  });
  return result.count > 0;
}

export async function restore(ctx: Ctx, id: string): Promise<boolean> {
  const result = await prisma.document.updateMany({
    where: { id, userId: ctx.userId, deletedAt: { not: null } },
    data: { deletedAt: null },
  });
  return result.count > 0;
}

export async function setStatus(
  documentId: string,
  status: "PENDING" | "CONVERTING" | "READY" | "FAILED",
): Promise<void> {
  // Worker-side: no ctx, because the job already proved ownership when it was
  // enqueued and the worker is not serving a request.
  await prisma.document.update({
    where: { id: documentId },
    data: { status: status as never },
  });
}

export async function setThumbnailKey(
  documentId: string,
  thumbnailKey: string,
): Promise<void> {
  await prisma.document.update({
    where: { id: documentId },
    data: { thumbnailKey },
  });
}

export async function ownerOf(documentId: string): Promise<string | null> {
  const row = await prisma.document.findUnique({
    where: { id: documentId },
    select: { userId: true },
  });
  return row?.userId ?? null;
}
