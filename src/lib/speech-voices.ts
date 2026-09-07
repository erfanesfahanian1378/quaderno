/**
 * Picking a voice, which is the whole difficulty of browser speech synthesis.
 *
 * A phone offers two or three voices per language and the first one is good.
 * A Mac offers a hundred and eighty, including "Bad News", "Bubbles" and
 * "Zarvox", and its list is alphabetical — so "take the first match for this
 * language" gives you Amélie (fr-CA) when you are learning French in France,
 * and a novelty voice for English. That is why read-aloud sounded fine on a
 * phone and awful on a Mac: same code, wildly different input.
 *
 * Nothing here can make a bad voice good. What it can do is stop choosing one.
 */

export type VoiceLike = {
  name: string;
  lang: string;
  localService: boolean;
  default: boolean;
};

/**
 * The region a learner means when they say the language.
 *
 * Someone studying "French" means France unless they say otherwise, and
 * getting Canadian French instead is not a subtle difference to an ear trying
 * to learn the accent. Absent from this map means no preference — `en` is
 * left out on purpose, because British and American are a real choice rather
 * than a default.
 */
const HOME_REGION: Record<string, string> = {
  it: "IT",
  fr: "FR",
  es: "ES",
  de: "DE",
  pt: "PT",
  nl: "NL",
  sv: "SE",
  da: "DK",
  nb: "NO",
  no: "NO",
  fi: "FI",
  is: "IS",
  pl: "PL",
  cs: "CZ",
  sk: "SK",
  hu: "HU",
  ro: "RO",
  bg: "BG",
  el: "GR",
  tr: "TR",
  ru: "RU",
  uk: "UA",
  he: "IL",
  ar: "SA",
  fa: "IR",
  hi: "IN",
  th: "TH",
  vi: "VN",
  id: "ID",
  ms: "MY",
  ja: "JP",
  ko: "KR",
  zh: "CN",
  ca: "ES",
  hr: "HR",
  sr: "RS",
};

/**
 * Quality markers that appear in a voice's name.
 *
 * Apple appends "(Enhanced)" and "(Premium)" to downloaded high-quality
 * voices, and Siri voices are the best on the platform. Chrome exposes
 * "Google <language>" voices which are remote and markedly better than the
 * macOS compact set. Microsoft's "Natural" voices are the equivalent on Edge.
 */
const QUALITY = [
  { pattern: /\bsiri\b/i, score: 100 },
  { pattern: /\bpremium\b/i, score: 90 },
  { pattern: /\benhanced\b/i, score: 80 },
  { pattern: /\bneural\b|\bnatural\b/i, score: 75 },
  { pattern: /\bgoogle\b/i, score: 70 },
  { pattern: /\bmicrosoft\b/i, score: 40 },
];

/**
 * macOS ships these as jokes. They are real entries in `getVoices()` with a
 * real `lang`, so an unfiltered "first match for en-US" can and does return
 * "Bad News", which sings your word to a funeral march.
 */
const NOVELTY = new Set(
  [
    "albert",
    "bad news",
    "bahh",
    "bells",
    "boing",
    "bubbles",
    "cellos",
    "good news",
    "jester",
    "junior",
    "kathy",
    "organ",
    "superstar",
    "trinoids",
    "whisper",
    "wobble",
    "zarvox",
    "bruce",
    "fred",
    "ralph",
    "deranged",
    "hysterical",
    "princess",
    "bells",
    "pipe organ",
  ].map((name) => name.toLowerCase()),
);

/**
 * The voice family macOS added in Ventura. They are localised into every
 * language — "Eddy (Italian (Italy))" — and they are the casual, lower-quality
 * tier rather than the system voice. Ranked below the standard voice for a
 * language, but not excluded: on some systems they are all there is.
 */
const CASUAL_FAMILY = [
  "eddy",
  "flo",
  "grandma",
  "grandpa",
  "reed",
  "rocko",
  "sandy",
  "shelley",
];

function baseLanguage(tag: string): string {
  return (tag.split(/[-_]/)[0] ?? "").toLowerCase();
}

function region(tag: string): string {
  return (tag.split(/[-_]/)[1] ?? "").toUpperCase();
}

/** Voices that can speak this language at all. */
export function voicesForLanguage<T extends VoiceLike>(
  voices: T[],
  languageCode: string,
): T[] {
  const wanted = baseLanguage(languageCode);
  return voices.filter((voice) => baseLanguage(voice.lang) === wanted);
}

/**
 * How good a voice is for this language, higher is better.
 *
 * Exported so a test can assert the ordering against a real captured voice
 * list rather than against an idea of one.
 */
export function scoreVoice(voice: VoiceLike, languageCode: string): number {
  const name = voice.name.toLowerCase();

  // A joke voice is never the answer, whatever else it scores.
  if (NOVELTY.has(name)) return -1000;

  let score = 0;

  for (const { pattern, score: bonus } of QUALITY) {
    if (pattern.test(voice.name)) {
      score += bonus;
      break;
    }
  }

  // "Eddy (Italian (Italy))" — match the leading family name only, so a real
  // voice that merely contains one of these words is not demoted.
  if (CASUAL_FAMILY.some((member) => name.startsWith(member))) score -= 50;

  const wantedRegion =
    region(languageCode) || HOME_REGION[baseLanguage(languageCode)] || "";
  const voiceRegion = region(voice.lang);

  if (wantedRegion && voiceRegion === wantedRegion) score += 60;
  else if (wantedRegion && voiceRegion) score -= 25;

  // A remote voice needs the network, so it loses a tie to an equal local one
  // — but only a tie. On a Mac the remote Google voices are better than the
  // local compact ones by far more than this.
  if (voice.localService) score += 5;

  if (voice.default) score += 3;

  return score;
}

/** Every usable voice for a language, best first. */
export function rankVoices<T extends VoiceLike>(
  voices: T[],
  languageCode: string,
): T[] {
  return voicesForLanguage(voices, languageCode)
    .map((voice) => ({ voice, score: scoreVoice(voice, languageCode) }))
    .filter((entry) => entry.score > -1000)
    .sort(
      (a, b) => b.score - a.score || a.voice.name.localeCompare(b.voice.name),
    )
    .map((entry) => entry.voice);
}

export function pickVoice<T extends VoiceLike>(
  voices: T[],
  languageCode: string,
): T | null {
  return rankVoices(voices, languageCode)[0] ?? null;
}

/**
 * True when nothing installed for this language is better than the operating
 * system's oldest tier.
 *
 * Worth surfacing rather than hiding: on macOS the good voices are a free
 * download that almost nobody knows about, and no amount of code will make
 * the compact ones sound right.
 */
export function onlyBasicVoices(
  voices: VoiceLike[],
  languageCode: string,
): boolean {
  const usable = voicesForLanguage(voices, languageCode);
  if (usable.length === 0) return false;
  return !usable.some((voice) =>
    QUALITY.some(({ pattern }) => pattern.test(voice.name)),
  );
}
