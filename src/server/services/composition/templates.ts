/**
 * Note-page templates.
 *
 * The vocabulary table and the verb conjugation grid are "the language-
 * learning payoff and should be in the first release" (ANNOTATION_ENGINE.md
 * §6) — they are the two that should look like something a learner actually
 * wants to fill in, rather than an empty box.
 *
 * Templates are markdown, because `NotePage.content` is markdown and that is
 * the source of truth. Lined and grid are visual treatments applied by the
 * editor, not content, so their markdown is empty and they carry a hint.
 */

export const TEMPLATE_KEYS = [
  "blank",
  "lined",
  "grid",
  "cornell",
  "vocabulary",
  "conjugation",
] as const;

export type TemplateKey = (typeof TEMPLATE_KEYS)[number];

export type Template = {
  key: TemplateKey;
  name: string;
  description: string;
  /** A visual treatment the editor paints behind the text. */
  ruling: "none" | "lined" | "grid" | "cornell";
  content: string;
};

const VOCABULARY = `## Vocabolario

| Parola | Traduzione | Esempio | Note |
| --- | --- | --- | --- |
|  |  |  |  |
|  |  |  |  |
|  |  |  |  |
|  |  |  |  |
|  |  |  |  |
|  |  |  |  |
|  |  |  |  |
|  |  |  |  |
`;

/**
 * Person x tense, which is the shape a learner actually revises in — a list of
 * forms is much harder to scan than a grid.
 */
const CONJUGATION = `## Verbo:

**Infinito:**  ·  **Participio:**  ·  **Gerundio:**

| | Presente | Passato prossimo | Imperfetto | Futuro |
| --- | --- | --- | --- | --- |
| io |  |  |  |  |
| tu |  |  |  |  |
| lui / lei |  |  |  |  |
| noi |  |  |  |  |
| voi |  |  |  |  |
| loro |  |  |  |  |

**Note:**
`;

const CORNELL = `## 

| Domande | Appunti |
| --- | --- |
|  |  |
|  |  |
|  |  |
|  |  |

---

**Riassunto**

`;

export const TEMPLATES: Record<TemplateKey, Template> = {
  blank: {
    key: "blank",
    name: "Blank",
    description: "An empty page. Write whatever you like.",
    ruling: "none",
    content: "",
  },
  lined: {
    key: "lined",
    name: "Lined",
    description: "Ruled lines, like a notebook.",
    ruling: "lined",
    content: "",
  },
  grid: {
    key: "grid",
    name: "Grid",
    description: "Squared paper, for diagrams and tables.",
    ruling: "grid",
    content: "",
  },
  cornell: {
    key: "cornell",
    name: "Cornell",
    description: "Questions on the left, notes on the right, summary below.",
    ruling: "cornell",
    content: CORNELL,
  },
  vocabulary: {
    key: "vocabulary",
    name: "Vocabulary table",
    description: "Word, translation, example, note — ready to fill in.",
    ruling: "none",
    content: VOCABULARY,
  },
  conjugation: {
    key: "conjugation",
    name: "Verb conjugation",
    description: "Person by tense, the way you actually revise a verb.",
    ruling: "none",
    content: CONJUGATION,
  },
};

export function templateContent(key: TemplateKey | undefined): string {
  return TEMPLATES[key ?? "blank"].content;
}

export function isTemplateKey(value: string): value is TemplateKey {
  return (TEMPLATE_KEYS as readonly string[]).includes(value);
}
