/**
 * Fractional indexing. DATA_MODEL.md §1.
 *
 * `Leaf.position` is a Decimal(30,15). Inserting between two leaves is the
 * average of their neighbours, so **reordering writes one row** rather than
 * renumbering the whole document. That is what makes "drop my page between
 * page 3 and page 4" a single update on a 200-page handout.
 *
 * The whole thing is done in string/decimal arithmetic rather than IEEE
 * doubles, because `(a + b) / 2` in floating point stops producing a value
 * strictly between a and b after about 50 insertions at the same spot, and
 * then two leaves collide on the unique index.
 */

/**
 * Below this gap, averaging stops being useful and the document is renumbered.
 * Written as a decimal STRING, not 1e-9: `String(1e-9)` is "1e-9", and the
 * exponential form is not something a fixed-point parser can read.
 */
export const MIN_GAP = "0.000000001";

const SCALE = 15; // Decimal(30,15)

function toBigInt(value: string): bigint {
  const negative = value.startsWith("-");
  const unsigned = negative ? value.slice(1) : value;
  const [whole = "0", fraction = ""] = unsigned.split(".");
  const padded = (fraction + "0".repeat(SCALE)).slice(0, SCALE);
  const scaled = BigInt(whole + padded);
  return negative ? -scaled : scaled;
}

function fromBigInt(value: bigint): string {
  const negative = value < 0n;
  const unsigned = negative ? -value : value;
  const text = unsigned.toString().padStart(SCALE + 1, "0");

  const whole = text.slice(0, text.length - SCALE);
  const fraction = text.slice(text.length - SCALE).replace(/0+$/, "");

  const out = fraction ? `${whole}.${fraction}` : whole;
  return negative ? `-${out}` : out;
}

/**
 * A position strictly between `prev` and `next`.
 *
 * - `prev = null` prepends (half of the first position)
 * - `next = null` appends (one past the last)
 * - both null is the first leaf in an empty document
 *
 * Returns `null` when the neighbours are too close to fit anything between,
 * which is the caller's signal to renumber.
 */
export function positionBetween(
  prev: string | null,
  next: string | null,
): string | null {
  if (prev === null && next === null) return "1";

  if (prev === null) {
    const upper = toBigInt(next!);
    // Prepending before a position at or below zero still has to stay ordered.
    const candidate = upper > 0n ? upper / 2n : upper - toBigInt("1");
    if (candidate >= upper) return null;
    return fromBigInt(candidate);
  }

  if (next === null) {
    return fromBigInt(toBigInt(prev) + toBigInt("1"));
  }

  const lower = toBigInt(prev);
  const upper = toBigInt(next);

  // Out of order, or identical: the caller has a corrupt document.
  if (upper <= lower) return null;

  // Adjacent at the smallest representable step — nothing fits between.
  if (upper - lower <= 1n) return null;

  return fromBigInt((lower + upper) / 2n);
}

/**
 * Whether the gap between two positions has collapsed far enough that the
 * document should be renumbered. DATA_MODEL.md §1 puts the threshold at 1e-9.
 */
export function needsRenumber(prev: string, next: string): boolean {
  const gap = toBigInt(next) - toBigInt(prev);
  return gap <= toBigInt(MIN_GAP);
}

/** Evenly spaced positions, for the renumber path. */
export function renumber(count: number): string[] {
  return Array.from({ length: count }, (_, index) => String(index + 1));
}

/** Numeric comparison for sorting, without going through Number. */
export function comparePositions(a: string, b: string): number {
  const left = toBigInt(a);
  const right = toBigInt(b);
  return left < right ? -1 : left > right ? 1 : 0;
}
