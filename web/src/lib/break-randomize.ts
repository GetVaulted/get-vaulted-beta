/** Deterministic PRNG from string seed (Mulberry32). */
function mulberry32(seed: number) {
  return function () {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hashSeed(s: string): number {
  let h = 1779033703 ^ s.length;
  for (let i = 0; i < s.length; i++) {
    h = Math.imul(h ^ s.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return h >>> 0;
}

export function shuffleWithSeed<T>(items: T[], seed: string): T[] {
  const arr = [...items];
  const rnd = mulberry32(hashSeed(seed));
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export type RandomAssignment = { order: number; label: string };

export function buildAssignments(labels: string[], seed: string): RandomAssignment[] {
  const shuffled = shuffleWithSeed(labels, seed);
  return shuffled.map((label, i) => ({ order: i + 1, label }));
}
