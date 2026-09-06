-- Search: accent-insensitive full text.
--
-- PHASE-09 is explicit that this is a requirement, not a nicety: "perche must
-- find perché, etudier must find étudier". This is an app for Italian and
-- French, and a learner types without accents constantly — on a phone, in a
-- hurry, or because they do not know where the accent goes yet. That last
-- case is the whole point of the app.
--
-- `unaccent` is the extension that does the folding; `pg_trgm` gives fuzzy
-- matching for near-misses.

CREATE EXTENSION IF NOT EXISTS unaccent;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- unaccent() is STABLE, not IMMUTABLE (its behaviour depends on a dictionary
-- that could be changed), so Postgres refuses it in a generated column or a
-- functional index. This wrapper asserts immutability, which is safe because
-- we never redefine the dictionary. Without it there is no index at all and
-- every search is a sequential scan.
CREATE OR REPLACE FUNCTION quaderno_unaccent(text)
  RETURNS text
  LANGUAGE sql
  IMMUTABLE
  PARALLEL SAFE
  STRICT
AS $$ SELECT public.unaccent('public.unaccent', $1) $$;

-- array_to_string() is only STABLE, because in general an array's element
-- output function may be stable. For text[] it is genuinely immutable — text
-- output cannot vary — so this wrapper asserts it for that one case. Without
-- it, any generated column touching tags or topics is rejected outright.
CREATE OR REPLACE FUNCTION quaderno_join(text[])
  RETURNS text
  LANGUAGE sql
  IMMUTABLE
  PARALLEL SAFE
AS $$ SELECT coalesce(array_to_string($1, ' '), '') $$;

-- Documents: title and tags.
ALTER TABLE "Document"
  ADD COLUMN IF NOT EXISTS "searchText" text
  GENERATED ALWAYS AS (
    quaderno_unaccent(lower(coalesce("title", '') || ' ' || quaderno_join("tags")))
  ) STORED;

CREATE INDEX IF NOT EXISTS "document_search_trgm"
  ON "Document" USING gin ("searchText" gin_trgm_ops);

-- Note pages: the content itself.
ALTER TABLE "NotePage"
  ADD COLUMN IF NOT EXISTS "searchText" text
  GENERATED ALWAYS AS (quaderno_unaccent(lower(coalesce("content", '')))) STORED;

CREATE INDEX IF NOT EXISTS "note_page_search_trgm"
  ON "NotePage" USING gin ("searchText" gin_trgm_ops);

-- Annotations: the quoted text of a highlight. This is the revision surface —
-- "what did I mark about the congiuntivo?" is a real question.
ALTER TABLE "Annotation"
  ADD COLUMN IF NOT EXISTS "searchText" text
  GENERATED ALWAYS AS (quaderno_unaccent(lower(coalesce("quotedText", '')))) STORED;

CREATE INDEX IF NOT EXISTS "annotation_search_trgm"
  ON "Annotation" USING gin ("searchText" gin_trgm_ops);

-- Comments: the body.
ALTER TABLE "Comment"
  ADD COLUMN IF NOT EXISTS "searchText" text
  GENERATED ALWAYS AS (quaderno_unaccent(lower(coalesce("body", '')))) STORED;

CREATE INDEX IF NOT EXISTS "comment_search_trgm"
  ON "Comment" USING gin ("searchText" gin_trgm_ops);

-- Class sessions: title and topics.
ALTER TABLE "ClassSession"
  ADD COLUMN IF NOT EXISTS "searchText" text
  GENERATED ALWAYS AS (
    quaderno_unaccent(lower(coalesce("title", '') || ' ' || quaderno_join("topics")))
  ) STORED;

CREATE INDEX IF NOT EXISTS "class_session_search_trgm"
  ON "ClassSession" USING gin ("searchText" gin_trgm_ops);
