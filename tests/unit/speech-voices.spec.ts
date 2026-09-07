import { describe, expect, it } from "vitest";
import {
  onlyBasicVoices,
  pickVoice,
  rankVoices,
  scoreVoice,
  type VoiceLike,
} from "@/lib/speech-voices";
import macos from "../fixtures/macos-voices.json";

/**
 * The fixture is a REAL `speechSynthesis.getVoices()` capture from a macOS
 * machine — 180 voices, no enhanced or premium ones installed, no remote
 * ones. That is the machine where read-aloud "worked perfectly on my phone
 * but awfully on my Mac", so it is the machine the ranking has to be right on.
 */
const VOICES = (
  macos as { name: string; lang: string; local: boolean; def: boolean }[]
).map((voice): VoiceLike => ({
  name: voice.name,
  lang: voice.lang,
  localService: voice.local,
  default: voice.def,
}));

describe("voice ranking, against a real macOS voice list", () => {
  it("has a fixture big enough to be the actual problem", () => {
    expect(VOICES.length).toBeGreaterThan(150);
  });

  it("picks France French, not Canadian French", () => {
    // The old code took the first alphabetical match, which is "Amélie"
    // (fr-CA). Someone learning French in France practising against a Quebec
    // accent is being taught the wrong thing.
    //
    // The region is the assertion; the name is not. This machine offers both
    // "Jacques" and "Thomas" for fr-FR, they are equally standard, and the
    // Web Speech API exposes nothing that separates them. Choosing between
    // two good voices is what the picker is for.
    const picked = pickVoice(VOICES, "fr");
    expect(picked?.lang).toBe("fr-FR");
    expect(["Jacques", "Thomas"]).toContain(picked?.name);
  });

  it("honours an explicit region over the default one", () => {
    expect(pickVoice(VOICES, "fr-CA")?.lang).toBe("fr-CA");
  });

  it("picks the standard Italian voice over the casual family", () => {
    const picked = pickVoice(VOICES, "it");
    expect(picked?.name).toBe("Alice");
    expect(picked?.lang).toBe("it-IT");
  });

  it("never picks a novelty voice", () => {
    // These are real entries with a real `lang`, and "first en-US match"
    // returns one of them.
    for (const code of ["en", "en-US", "en-GB"]) {
      const picked = pickVoice(VOICES, code);
      expect(picked?.name.toLowerCase()).not.toMatch(
        /bad news|bubbles|zarvox|boing|bahh|trinoids|albert|jester|wobble/,
      );
    }
  });

  it("excludes novelty voices from the list a user can choose from", () => {
    const names = rankVoices(VOICES, "en").map((voice) => voice.name);
    expect(names).not.toContain("Bad News");
    expect(names).not.toContain("Zarvox");
    expect(names).not.toContain("Bubbles");
    expect(names.length).toBeGreaterThan(0);
  });

  it("ranks the casual Ventura family below the standard voice", () => {
    const ranked = rankVoices(VOICES, "it").map((voice) => voice.name);
    expect(ranked[0]).toBe("Alice");
    // Still offered — on some systems they are all there is.
    expect(ranked.some((name) => name.startsWith("Eddy"))).toBe(true);
    expect(ranked.indexOf("Alice")).toBeLessThan(
      ranked.findIndex((name) => name.startsWith("Eddy")),
    );
  });

  it("returns nothing for a language the machine cannot speak", () => {
    expect(pickVoice(VOICES, "yo")).toBeNull();
    expect(rankVoices(VOICES, "yo")).toEqual([]);
  });

  it("reports that this machine has only basic voices", () => {
    // It does: nothing Enhanced, Premium, Siri or Google is installed. This
    // is what the UI uses to offer the one fix code cannot apply.
    expect(onlyBasicVoices(VOICES, "it")).toBe(true);
    expect(onlyBasicVoices(VOICES, "fr")).toBe(true);
  });

  it("says nothing about a language with no voices at all", () => {
    expect(onlyBasicVoices(VOICES, "yo")).toBe(false);
  });
});

describe("voice scoring", () => {
  const voice = (over: Partial<VoiceLike>): VoiceLike => ({
    name: "Test",
    lang: "it-IT",
    localService: true,
    default: false,
    ...over,
  });

  it("prefers a downloaded high-quality voice over the compact one", () => {
    expect(
      scoreVoice(voice({ name: "Alice (Enhanced)" }), "it"),
    ).toBeGreaterThan(scoreVoice(voice({ name: "Alice" }), "it"));
    expect(
      scoreVoice(voice({ name: "Alice (Premium)" }), "it"),
    ).toBeGreaterThan(scoreVoice(voice({ name: "Alice (Enhanced)" }), "it"));
  });

  it("prefers Chrome's remote Google voice to a local compact one", () => {
    // The reverse of what you would guess, and the reverse of what the old
    // code did: on a desktop the Google voices are much better than the
    // system's oldest local ones, and the network cost is a word at a time.
    expect(
      scoreVoice(voice({ name: "Google italiano", localService: false }), "it"),
    ).toBeGreaterThan(scoreVoice(voice({ name: "Alice" }), "it"));
  });

  it("prefers a local voice only as a tie-breaker", () => {
    const local = scoreVoice(
      voice({ name: "Alice", localService: true }),
      "it",
    );
    const remote = scoreVoice(
      voice({ name: "Alice", localService: false }),
      "it",
    );
    expect(local - remote).toBeLessThan(20);
    expect(local).toBeGreaterThan(remote);
  });

  it("rejects a joke voice outright", () => {
    expect(scoreVoice(voice({ name: "Zarvox", lang: "en-US" }), "en")).toBe(
      -1000,
    );
  });
});
