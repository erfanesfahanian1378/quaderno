# Quaderno — Design Brief

_A brief for Claude Design. Everything needed to produce the full screen set
without asking follow-up questions._

---

## 0. How to use this brief

Produce a design canvas with the artboards listed in §5, in that order, at the
frames given in §4. Design **mobile and desktop for every screen marked
`both`**; the rest are desktop-only or mobile-only as marked. Use the tokens in
§3 verbatim — they are the ones the code will implement, so a design that
invents a fourth grey or a second accent creates work downstream.

Two things matter more than anything else here:

1. **The document viewer (§5.7) is the product.** It deserves the most
   attention, the most states, and the most care about one-handed mobile use.
   If time is limited, make that screen excellent and the rest merely correct.
2. **This is a tool people open every day for a year.** Design for the
   hundredth session, not the first. Quiet, low-chrome, no celebration
   animations, no illustrations that get old.

---

## 1. Product in one paragraph

Quaderno is a study notebook for people learning languages. You upload the
handouts and slides from your class, mark them up the way you would mark up
paper — highlighter, pen, sticky notes — and slot your own written pages
straight into the same document, between the teacher's pages. A timer and a
weekly goal keep an honest record of how much you actually studied. It runs in
a browser, installs as an app on a phone, and works offline.

**The one-line promise:** _your class, your marks, your pages, your hours — in
one place._

## 2. Who it is for, and the moments to design around

**Primary user.** An adult learning one or two languages alongside a full-time
job or degree. Currently juggling a PDF reader, a notes app and a spreadsheet.
Not a beginner with software; impatient with friction; will abandon anything
that loses a note.

Three moments the design must serve:

| Moment                                    | Context                          | What it demands                                                                                  |
| ----------------------------------------- | -------------------------------- | ------------------------------------------------------------------------------------------------ |
| **In class**, phone or tablet on the desk | 90 minutes, distracted, one hand | Fast capture. Two taps to a blank note page. Big touch targets. Nothing that requires precision. |
| **Reviewing at home**, laptop             | 40 focused minutes               | Density. Two panes. Keyboard shortcuts. See notes and source together.                           |
| **On the metro**, phone, no signal        | 12 minutes                       | Reading and light annotation offline, with an honest sync indicator.                             |

**Emotional register.** Calm, tactile, a little bit paper. Not gamified — no
confetti, no mascot, no streak-shaming. Progress is shown as information, not
as praise. The one exception: hitting a weekly goal earns a single quiet
moment, described in §7.

## 3. Visual direction

### 3.1 Concept: _paper and ink_

Warm, slightly off-white surfaces; ink-dark text; one accent per language;
highlighter colours that look like real highlighter. The interface recedes and
the document is the brightest thing on screen. Borders are hairlines, not
boxes. Depth comes from one or two soft shadow levels, never from gradients
or glassmorphism.

Explicitly avoid: purple-to-blue gradients, glowing cards, 3D illustrations,
oversized rounded corners, emoji as iconography, dark-mode-first neon.

### 3.2 Colour tokens

Define both themes. Every token below must exist in both.

**Neutrals — light**

```
--bg-canvas      #F7F6F3   app background (warm paper grey)
--bg-surface     #FFFFFF   cards, panels, the document page itself
--bg-subtle      #F0EEE9   hover, inset wells, table stripes
--bg-inset       #E8E5DE   scrollbar track, disabled fill
--border-subtle  #E4E1DA   hairline dividers
--border-strong  #CFCBC2   input borders, focused container
--text-primary   #1C1B18   ink
--text-secondary #57544D   labels, metadata
--text-tertiary  #8C877D   timestamps, placeholders
--text-inverse   #FBFAF8
```

**Neutrals — dark**

```
--bg-canvas      #16161A
--bg-surface     #1E1E23
--bg-subtle      #26262C
--bg-inset       #2E2E35
--border-subtle  #2F2F37
--border-strong  #45454F
--text-primary   #F0EEE9
--text-secondary #ABA79E
--text-tertiary  #7A766E
--text-inverse   #16161A
```

**Language accents.** Assigned per language, user-changeable. Each has a
`base`, a `soft` (12% tint for backgrounds) and an `on` (text on base). Six
options, all ≥4.5:1 against their `on` value _and_ as text on `--bg-surface`:

```
accent-1  Basil   #3F7D58 / soft #E6EFE9 / on #FFFFFF   4.90:1
accent-2  Indigo  #4A5FBF / soft #E7EAF7 / on #FFFFFF   5.71:1
accent-3  Ochre   #9A6A14 / soft #F6EEDE / on #FFFFFF   4.72:1
accent-4  Rust    #B14A32 / soft #F7E9E5 / on #FFFFFF   5.39:1
accent-5  Teal    #2C7A82 / soft #E2EFF0 / on #FFFFFF   4.98:1
accent-6  Plum    #7A4A82 / soft #F0E8F2 / on #FFFFFF   6.71:1
```

> **Corrected in PHASE-01.** Ochre was specified as `#B57A1F`, which measures
> **3.64:1** against white — it failed the ≥4.5:1 claim this same section
> makes, both as white-on-accent and as accent-as-text on a white surface.
> Darkened to `#9A6A14` (4.72:1). The other five were already correct.
> `tests/unit/contrast.spec.ts` now walks every pair, so the next drift fails
> the build instead of shipping.

**Dark-mode accents.** The brief originally gave light values only. Every one
of them fails 4.5:1 as text on `--bg-surface` in dark mode (Basil measures
3.7:1 on `#16161A`), so dark mode uses lightened bases, a `soft` that is the
base mixed 18% into the surface, and an `on` that flips to ink:

```
accent-1  Basil   #6FB58A / soft #242F2D / on #16161A
accent-2  Indigo  #8B9BE8 / soft #262A3F / on #16161A
accent-3  Ochre   #D9A64A / soft #392F22 / on #16161A
accent-4  Rust    #E08B72 / soft #382626 / on #16161A
accent-5  Teal    #5FB6BF / soft #212F34 / on #16161A
accent-6  Plum    #BE8CC6 / soft #2F2634 / on #16161A
```

**Highlighter colours.** These are the marks on the page and are a distinct
scale — they must read as translucent ink on white paper _and_ stay visible
when the viewer inverts pages in dark mode. Provide a light value and a
dark-mode value for each. Each carries a user-editable label.

```
hl-yellow  #FFE27A / dark #7C6614   default label "grammar"
hl-green   #A9E5A0 / dark #2F6B2A   default label "vocabulary"
hl-blue    #9FD0F5 / dark #23577F   default label "to review"
hl-pink    #F7A8C4 / dark #7E2F4C   default label "important"
hl-orange  #FFC48A / dark #8A5220   default label "question"
```

> **Corrected in PHASE-01.** Dark `hl-yellow` was `#8A7420`, which left
> `--text-primary` at **3.94:1** on top of it — a highlight you cannot read
> through is not a highlight. Darkened to `#7C6614` (4.81:1). The other four
> dark values already passed. The binding requirement is that page text stays
> ≥4.5:1 _over_ the mark, in both themes; the ≥3:1 figure in
> `ANNOTATION_ENGINE.md §10` is the separate question of the mark being
> visible against the page, and both are tested.

**Pen ink colours** (freehand and text boxes): `#1C1B18`, `#B14A32`,
`#2C6BB1`, `#3F7D58`. Solid, not translucent.

**Semantic**

```
--success #2E7D4F   --warning #B57A1F   --danger #C0392B   --info #4A5FBF
```

Each with a `soft` background variant for inline banners.

### 3.3 Typography

Two families, both variable, both self-hosted.

- **UI:** _Inter_ (or Geist). Used for every control, label and navigation
  element.
- **Reading & note content:** _Source Serif 4_ (or Literata). Used inside note
  pages, in long summaries, and in the document title on the viewer header.
  This is what makes the note pages feel like a notebook rather than a form.
- **Mono:** _JetBrains Mono_, for code blocks in notes only.

Both families **must** ship Latin Extended-A. `à è é ì ò ù ç œ â ê î ô û ë ï
ü` appear constantly; render a specimen line of them on the typography
artboard so a missing glyph is caught in design, not in production.

```
display   32 / 38   -0.02em  600
h1        24 / 30   -0.015em 600
h2        20 / 26   -0.01em  600
h3        17 / 24   -0.005em 600
body      15 / 23    0       400
body-sm   13 / 19    0       400
label     13 / 16    0.005em 500
caption   12 / 16    0.01em  450
note-body 17 / 28    0       400   (serif — note page content)
```

Mobile: body stays 15 px minimum; inputs 16 px so iOS does not zoom on focus.

### 3.4 Space, radius, elevation, motion

- **Space scale** (4 px base): `4 8 12 16 20 24 32 40 48 64`.
- **Radius:** `sm 6` inputs and chips · `md 10` cards and buttons ·
  `lg 14` panels and sheets · `full` avatars and the timer pill.
  Document pages have radius `2` — paper barely rounds.
- **Elevation:** only three.
  `e1` `0 1px 2px rgba(28,27,24,.06)` cards ·
  `e2` `0 4px 16px rgba(28,27,24,.10)` popovers, floating toolbar ·
  `e3` `0 12px 32px rgba(28,27,24,.16)` modals, mobile sheets.
  In dark mode, elevation is a lighter surface plus a subtler shadow.
- **Motion:** `120ms ease-out` for hover and colour, `180ms
cubic-bezier(.2,.8,.2,1)` for panels and sheets, `220ms` for page
  transitions. Nothing longer than 250 ms. Everything respects
  `prefers-reduced-motion`, which must be shown on at least one artboard.
- **Focus ring:** 2 px `--accent-base` at 2 px offset, on every interactive
  element, never removed.

---

## 4. Frames and layout

| Breakpoint | Frame       | Layout                                                                        |
| ---------- | ----------- | ----------------------------------------------------------------------------- |
| Mobile     | 390 × 844   | Single column. Bottom tab bar (5 items). Sheets instead of dialogs.           |
| Tablet     | 834 × 1112  | Two panes in the viewer; rail navigation.                                     |
| Desktop    | 1440 × 900  | Persistent 240 px left sidebar; content max-width 1120 px, centred.           |
| Wide       | 1920 × 1080 | Sidebar 260 px; the viewer gains a third pane (thumbnails + page + comments). |

Grid: 12 columns, 24 px gutters, 32 px page margins on desktop; 16 px margins
on mobile. Sidebar sits outside the grid.

**Safe areas.** Mobile bottom bar respects `env(safe-area-inset-bottom)`. The
viewer's floating toolbar sits above it, never behind it.

---

## 5. Screens

Mark each artboard with its name and breakpoint. `both` = design mobile and
desktop.

### 5.1 Sign in / Sign up / Reset — `both`

Split layout on desktop: form left (max 400 px), on the right a quiet
composition of a document page with a highlight and a hand-written margin note
— the product's promise in one image, no stock photography. Mobile is the form
alone, logo at the top.

Fields, one primary button, an OAuth divider, a link to the other mode.
Include the error state (wrong password), the loading state (button spinner,
form disabled), and the "check your inbox" confirmation.

### 5.2 Onboarding — `both`, 3 steps

Progress as three dots, skippable at every step.

1. **Add your first language.** A grid of common languages with flags-as-
   letterforms (not emoji flags), plus "other". Picking one assigns an accent
   automatically and shows the accent swatch changing — the moment the app
   becomes _theirs_.
2. **Set a weekly goal.** A slider from 1 to 20 hours with a live "that's about
   40 minutes a day" translation underneath. Default 3 h.
3. **Add your class times** (optional). Day-of-week toggles, a time, a
   duration. One line of copy: "we'll ask if you attended, so your hours log
   themselves."

### 5.3 Dashboard / Today — `both`

The first thing seen every day. Top to bottom:

- **Greeting line** with the date, quiet, `text-secondary`.
- **Goal row:** one card per language, each with a progress **ring** (not a
  bar) showing this week's minutes against the goal, the language name, the
  accent, and a pace line: _"1h 40m of 3h — on pace"_ / _"behind by 45m"_.
- **Next class** card if one is scheduled in the next 48 h: language, title,
  time, location, and an "add materials" action.
- **Continue** — a horizontally scrolling row of the last 6 documents, each a
  page-1 thumbnail with title, language dot and "opened 2 days ago".
- **This week** — a compact 7-bar chart, weekdays labelled, today emphasised,
  stacked by language.
- **Start timer** — a primary button, always reachable; on mobile it is a FAB
  above the tab bar.

Design the **empty dashboard** too: no languages, no documents. It is the
second-most-seen screen in the first week.

### 5.4 Language home — `desktop` + `mobile`

Header: language name, CEFR chip, accent, this-week ring, "log time" and
"add material" actions. Then tabs: **Classes** · **Library** · **Stats**.

### 5.5 Classes — `both`

A vertical timeline of `ClassSession`s, newest first, grouped by month.
Each row: date block on the left (day number + weekday), title, topic chips,
attached-material count with tiny thumbnails, and an attendance mark. Rows
expand in place to show the summary and the material list.

Include: an upcoming (unconfirmed) occurrence styled as an outline row with a
"did you attend?" inline confirm; and the empty state.

### 5.6 Library — `both`

Grid of document cards by default, list view as an alternative — design both.

Card: page-1 thumbnail (4:3 crop, top-aligned so the header of the handout is
visible), title, language dot, class date, tag chips, an annotation-count
badge, and a star. Overflow menu on hover / long-press.

Filter bar: language, course, tag, starred, sort. Search field. A prominent
**upload dropzone** — on desktop the whole grid accepts a drag, showing a
dashed accent overlay across the content area.

Required states: uploading (per-file progress), **converting** (a card with a
shimmer and "converting from .docx…"), **conversion failed** (a card with a
warning, "download original" and "retry"), empty library, no search results.

### 5.7 Document viewer — `both` — **the centrepiece**

**Desktop, three regions:**

- **Left rail, 180 px, collapsible.** Page thumbnails in leaf order. Note
  pages are visually distinct — a paper texture and a folded corner — so the
  user can see at a glance where their own pages sit among the teacher's.
  Drag to reorder. A `+` button between any two thumbnails inserts a page
  there; show that hover affordance explicitly on an artboard.
- **Centre, the pages.** Continuous vertical scroll, page shadow, page number
  under each page, comfortable gutters. Fit-width by default.
- **Right rail, 320 px, toggleable.** Tabs: **Comments** (threads, resolvable,
  clicking scrolls to the mark) · **Annotations** (a list of every highlight
  with its quoted text, filterable by colour label — this is the revision view
  and it is a genuinely important screen) · **Info** (source file, conversion
  engine and the "layout may differ, original kept" notice, tags, class link).

**The annotation toolbar** is a floating pill, horizontally centred, ~64 px
above the bottom edge on desktop and just above the tab bar on mobile.
Contents, left to right: select/pan · highlight (with a colour swatch that
expands upward into the five highlighter colours and their labels) · pen (ink
colour + three widths) · eraser · text box · shape · comment pin · undo · redo.
The active tool is a filled accent chip. Design the expanded colour popover.

**Selection flow.** Selecting text raises a small contextual popover directly
above the selection: five colour dots, underline, strikethrough, "add
comment", copy. Design this — it is the most-used interaction in the app.

**Mobile viewer.** Full-bleed pages, chrome auto-hides on scroll and returns
on tap. Top bar: back, title, sync state, overflow. Bottom: the tool pill,
thumb-reachable, ≥48 px targets. Thumbnails and comments become bottom sheets.
A page-number pill appears while scrolling and fades after 800 ms.

**States to design:**

- Loading — page skeletons at the right aspect ratio, no spinner over the whole
  screen
- Scanned document, no text layer — an inline dismissible hint offering OCR
- OCR running — a progress chip in the header
- Offline — a banner strip, plus the sync indicator reading "3 changes queued"
- A highlight with an open comment thread, connector line to the right rail
- An **orphaned** annotation after re-conversion, flagged and offered a fix
- Text selection active, popover open
- Pen mode with palm rejection active on a tablet

### 5.8 Note page editor — `both`

The note page is a real page in the scroll flow, not a modal. When focused it
gains a subtle accent border and a compact formatting toolbar docked to its
top edge: heading, bold, italic, list, checklist, table, code, insert image,
insert vocabulary row.

**Template picker** shown when a page is inserted: Blank · Lined · Grid ·
Cornell · Vocabulary table · Verb conjugation. Design the picker and design
the **vocabulary table** and **verb conjugation** templates properly — those
two are the language-learning payoff and should look like something a learner
would actually want to fill in.

Serif body type. Generous line height. A visible autosave state
("saved · 2s ago") that never nags.

### 5.9 Study timer — `both`

Two forms:

- **Pill** — persistent, bottom-right on desktop, above the tab bar on mobile.
  Shows the language accent, elapsed time in tabular figures, and a stop
  button. Never covers the annotation toolbar; on mobile it collapses to a
  dot while the toolbar is open.
- **Focus mode** — a full screen: large elapsed time, language, activity type
  chips (class, homework, reading, review, listening, speaking, writing),
  optional linked document, pause / stop / discard. Dimmed background. This is
  what a user leaves open on a second monitor.

Also design the **manual log sheet**: language, activity, date, start time,
duration (with quick chips 15/30/45/60/90 min), an optional note, and an
optional link to a class or document.

### 5.10 Stats — `both`

- **Range control:** week · month · year · all.
- **Weekly bars,** stacked by language, with the goal drawn as a dashed
  reference line.
- **Year heatmap,** 53 × 7 cells, four intensity steps derived from the
  language accent, month labels, weekday labels on the left. Design its hover
  tooltip and its mobile form (horizontally scrollable, snapping by month).
- **Per-language comparison:** a horizontal bar per language with total hours
  and change vs. the previous period.
- **Breakdown by activity:** a donut or a stacked bar — pick one and only one;
  do not use both anywhere in this app.
- **Streak card:** current and longest, stated plainly. No flames, no
  guilt-tripping copy when a streak breaks.

### 5.11 Schedule — `both`

Desktop: a week grid with class blocks in language accents, plus a list of the
next four weeks. Mobile: an agenda list grouped by day. An occurrence in the
past that has not been confirmed shows an inline "attended? yes / no".
Include the recurring-class editor (day toggles, time, duration, end date).

### 5.12 Search — `both`

One field, results grouped by type: Documents · Note pages · Highlights ·
Comments · Classes. Each result shows a snippet with the match emphasised and
a breadcrumb (`Italiano › B1 course › 12 Mar`). Highlight results show the
quoted text in its highlighter colour. Design the empty state and the
accent-insensitivity note ("_perche_ also finds _perché_").

### 5.13 Settings — `desktop` + `mobile`

Sections: Profile · Languages (reorder, rename, accent, CEFR, archive) ·
Goals · Highlighter labels (rename the five colours) · Appearance
(light/dark/system, reading font size) · Storage (a usage bar against quota,
largest documents, empty trash) · Data (export everything, delete account with
a typed-confirmation dialog).

### 5.14 System states — `desktop`

One artboard collecting: 404, 500, offline, quota exceeded, session expired,
maintenance. Same visual language, one short sentence, one action each.

---

## 6. Component inventory

Deliver these as a components artboard with every variant and state
(default / hover / active / focus-visible / disabled / loading), in both
themes.

**Primitives** — Button (primary, secondary, ghost, danger; sm/md/lg; icon-only)
· Icon button · Input · Textarea · Select · Combobox · Checkbox · Radio ·
Switch · Slider · Chip / Tag (removable and static) · Badge · Avatar ·
Tooltip · Segmented control · Dropdown menu · Dialog · Bottom sheet · Popover ·
Toast · Inline banner (info / warning / danger / success) · Skeleton ·
Progress bar · Progress ring · Tabs · Breadcrumb · Empty state · Command
palette (⌘K) · Pagination ("load more" button, not numbered pages).

**Domain components** — Language pill (dot + name) · Goal ring · Study timer
pill · Document card (grid and list) · Page thumbnail (source vs. note
variants) · Annotation toolbar pill · Highlighter colour swatch picker ·
Selection popover · Comment card and thread · Annotation list row · Upload
dropzone · Conversion progress card · Class timeline row · Heatmap cell and
grid · Weekly bar chart · Activity chip row · Note-page template card ·
Sync-state indicator (synced / n pending / offline) · Page-number pill.

**Iconography.** One line-icon set, 1.5 px stroke, 20 px and 24 px sizes,
rounded caps. Lucide or equivalent. No filled icons except the active tool in
the annotation toolbar and the starred state.

---

## 7. Micro-interactions worth designing

Small, and they carry the whole feel:

- **Applying a highlight** — the colour sweeps left-to-right across the
  selection over 140 ms, as a real highlighter would.
- **Inserting a page** — the pages below slide down 180 ms and the new page
  fades in; never a jump-cut.
- **Timer running** — the accent ring around the pill breathes very slowly
  (4 s cycle, ~3% scale). Disabled under `prefers-reduced-motion`.
- **Hitting a weekly goal** — the ring completes and holds a full accent fill
  for 1.5 s with a single soft pulse. One line: _"3h goal reached."_ Nothing
  more. No confetti.
- **Sync completing** — the "3 pending" indicator crossfades to a check that
  fades out after 2 s. Never a toast; it happens too often.
- **Pull-to-refresh** on mobile lists — standard, with the accent colour.

---

## 8. Accessibility requirements

Non-negotiable, and to be shown in the deliverable:

- Contrast ≥4.5:1 for body text, ≥3:1 for large text, UI borders and chart
  elements — **in both themes**. Include a contrast audit artboard.
- Focus-visible on every interactive element, on every artboard that has one.
- Touch targets ≥44 × 44 px on mobile; ≥48 px in the annotation toolbar.
- Colour is never the only channel: highlighter colours carry text labels,
  chart series carry direct labels, the sync indicator carries an icon and a
  word.
- Every screen must be usable at 200% browser zoom without horizontal
  scrolling — design the 1440 desktop viewer at 200% as one artboard.
- Design the visible skip-link and the keyboard-shortcut sheet (`?`).

---

## 9. Deliverables

1. **Foundations artboard** — colour tokens (both themes), type scale with the
   accented-glyph specimen, space/radius/elevation scale, icon set.
2. **Components artboard** — the full inventory in §6, every variant and state,
   both themes.
3. **Screen artboards** — §5.1 through §5.14 at the breakpoints marked, light
   theme, plus dark-theme versions of the dashboard, the viewer, the note
   editor and the stats screen.
4. **Viewer state matrix** — one artboard collecting every viewer state listed
   in §5.7.
5. **Two flow boards** — (a) upload a .docx → converting → viewer → highlight →
   comment; (b) class ends → confirm attendance → time logged → dashboard ring
   moves.
6. **Accessibility artboard** — contrast audit, focus states, 200% zoom.

**Naming:** `screen/viewer-desktop-default`, `screen/viewer-mobile-pen`,
`component/button`, `foundation/color`. Prefix every artboard so the
implementation can find them from a phase brief.

## 10. Out of scope

No marketing site beyond the sign-in split panel. No admin console. No email
templates. No native app shells. No logo exploration — use the wordmark
"Quaderno" set in the UI display style until a mark exists.
