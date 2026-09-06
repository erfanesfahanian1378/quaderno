# PHASE 07 — Composition, note pages & export

**Goal:** the user can write their own pages, drop them anywhere inside a
document — including between two pages of the teacher's handout — reorder
everything, and export the result as a PDF.

**Prerequisites:** Phases 01–06. Read `DATA_MODEL.md §1` and
`ANNOTATION_ENGINE.md §6, §8`.

## Scope

1. **Fractional indexing** — `src/server/services/composition/position.ts`:
   `positionBetween(prev?, next?)`, with the renumber path when the gap falls
   below `1e-9`. Property-tested with 10,000 random insertions.
2. **Leaf endpoints** — create, move, duplicate, hide, label, rotate, per
   `API.md`. `leafCount` maintained transactionally.
3. **Note pages** — `PUT /api/note-pages/:id` with 800 ms debounced autosave
   and `If-Unmodified-Since` → 409 on conflict, surfaced as "this page changed
   elsewhere — reload or overwrite".
4. **Markdown editor** — TipTap (or Lexical) over markdown, with:
   headings, bold, italic, lists, checklists, tables, code, blockquote,
   inline images (uploaded through the Phase 04 storage path), and links.
   Serif body per the design brief. Keyboard shortcuts. Paste from Word
   cleaned to markdown, not to a wall of spans.
5. **Templates** on insert — Blank, Lined, Grid, Cornell, **Vocabulary table**
   (word / translation / example / notes), **Verb conjugation** (person ×
   tense grid). The last two are the language-learning payoff; make them good.
6. **Insert UX** — the `+` affordance between thumbnails in the rail, an
   "insert page here" action in the page overflow menu, and the template
   picker. Insertion animates per design brief §7 and never jump-cuts.
7. **Reordering** — drag in the thumbnail rail, with a live drop indicator;
   one row updated per move.
8. **NATIVE documents** — `POST /api/documents` creating a note-only document
   from a template. Same viewer, same annotation layer, no separate code path.
9. **Annotation on note pages** — verify it already works (it should; the layer
   binds to `Leaf`). Add the test.
10. **Export** — `pdf-lib` in a web worker, three flavours (flattened,
    layered, notes-only) per `ANNOTATION_ENGINE.md §8`. Note-page markdown is
    typeset by a small layout pass over pdf-lib — **no headless browser**.
    Embed serif + sans subsets with full Latin Extended-A.
11. **Server-side export fallback** for documents over 150 leaves: a queued job
    reusing the same layout code, `GET /api/exports/:id` for status and the
    download URL.
12. **Print stylesheet** so `⌘P` on a document produces something sane.

## Out of scope

Real-time co-editing. Handwriting-to-text. Audio note attachments (roadmap).

## Key files

```
src/server/services/composition/{index.ts,position.ts,leaves.ts,templates.ts}
src/server/repositories/note-page.ts
src/app/api/documents/[documentId]/leaves/route.ts
src/app/api/leaves/[leafId]/{route.ts,move/route.ts,duplicate/route.ts}
src/app/api/note-pages/[id]/route.ts
src/app/api/documents/[documentId]/export/route.ts
src/components/editor/{NotePageEditor.tsx,Toolbar.tsx,templates/**}
src/components/viewer/{InsertPageAffordance.tsx,TemplatePicker.tsx}
src/workers/export.worker.ts
src/lib/export/{bake.ts,typeset.ts,fonts.ts}
worker/jobs/document-export.ts
tests/unit/position.spec.ts  tests/e2e/composition.spec.ts
```

## Acceptance criteria

- [ ] Insert a note page between source pages 3 and 4; reload; it is still
      between them; the source PDF is byte-identical to the upload (sha256
      compared in the test).
- [ ] 10,000 random insertions never collide and never produce an out-of-order
      read — property test.
- [ ] Reordering a page issues exactly **one** row update, asserted by a query
      counter.
- [ ] Deleting a page hides the leaf and preserves every annotation on it;
      un-hiding restores them.
- [ ] A note page can be highlighted and drawn on exactly like a source page.
- [ ] Export flattened: a 30-page document with 100 mixed annotations exports
      in under 8 s in the browser, and opens correctly in Preview, Acrobat and
      Chrome's viewer.
- [ ] Export layered: highlights and ink are real, editable PDF annotations in
      Acrobat.
- [ ] `à è é ì ò ù ç œ â ê î ô û ë ï ü` all render in the exported PDF — a
      fixture note page containing them is diffed against a reference render.
- [ ] Autosave conflict (edit the same note in two tabs) produces a 409 and the
      documented recovery UI, not silent data loss.
