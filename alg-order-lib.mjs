/**
 * Lightweight 3x3 facelet cube + algorithm order (smallest n with alg^n = I).
 */

export const ALG_ALIASES = {
  sexy: "R U R' U'",
  sledge: "R' F R F'",
  sune: "R U R' U R U2 R'",
  "anti-sune": "R' U' R U' R' U2 R",
  antisune: "R' U' R U' R' U2 R",
  t: "F R U R' U' F'",
};

const U = 0,
  R = 9,
  F = 18,
  D = 27,
  L = 36,
  B = 45;

function cycle(state, ...idxs) {
  const last = state[idxs[idxs.length - 1]];
  for (let i = idxs.length - 1; i > 0; i--) state[idxs[i]] = state[idxs[i - 1]];
  state[idxs[0]] = last;
}

function twistFace(state, f) {
  cycle(state, f, f + 2, f + 8, f + 6);
  cycle(state, f + 1, f + 5, f + 7, f + 3);
}

function moveU(s) {
  twistFace(s, U);
  // Looking down at U: F → L → B → R (clockwise)
  cycle(s, F, L, B, R);
  cycle(s, F + 1, L + 1, B + 1, R + 1);
  cycle(s, F + 2, L + 2, B + 2, R + 2);
}
function moveD(s) {
  twistFace(s, D);
  // Looking down at D: F → R → B → L (clockwise)
  cycle(s, F + 6, R + 6, B + 6, L + 6);
  cycle(s, F + 7, R + 7, B + 7, L + 7);
  cycle(s, F + 8, R + 8, B + 8, L + 8);
}
function moveR(s) {
  twistFace(s, R);
  cycle(s, U + 2, B + 6, D + 2, F + 2);
  cycle(s, U + 5, B + 3, D + 5, F + 5);
  cycle(s, U + 8, B, D + 8, F + 8);
}
function moveL(s) {
  twistFace(s, L);
  cycle(s, U, F, D, B + 8);
  cycle(s, U + 3, F + 3, D + 3, B + 5);
  cycle(s, U + 6, F + 6, D + 6, B + 2);
}
function moveF(s) {
  twistFace(s, F);
  cycle(s, U + 6, R, D + 2, L + 8);
  cycle(s, U + 7, R + 3, D + 1, L + 5);
  cycle(s, U + 8, R + 6, D, L + 2);
}
function moveB(s) {
  twistFace(s, B);
  cycle(s, U + 2, L, D + 6, R + 8);
  cycle(s, U + 1, L + 3, D + 7, R + 5);
  cycle(s, U, L + 6, D + 8, R + 2);
}

const FACE_FNS = { U: moveU, D: moveD, R: moveR, L: moveL, F: moveF, B: moveB };

function applyFace(state, face, turns) {
  const fn = FACE_FNS[face];
  const t = ((turns % 4) + 4) % 4;
  for (let i = 0; i < t; i++) fn(state);
}

/** M like L (slice between L & R). */
function applyM(s, turns) {
  const t = ((turns % 4) + 4) % 4;
  for (let i = 0; i < t; i++) {
    cycle(s, U + 1, F + 1, D + 1, B + 7);
    cycle(s, U + 4, F + 4, D + 4, B + 4);
    cycle(s, U + 7, F + 7, D + 7, B + 1);
  }
}

/** E like D (slice between U & D). */
function applyE(s, turns) {
  const t = ((turns % 4) + 4) % 4;
  for (let i = 0; i < t; i++) {
    cycle(s, F + 3, R + 3, B + 3, L + 3);
    cycle(s, F + 4, R + 4, B + 4, L + 4);
    cycle(s, F + 5, R + 5, B + 5, L + 5);
  }
}

/** S like F (slice between F & B). */
function applyS(s, turns) {
  const t = ((turns % 4) + 4) % 4;
  for (let i = 0; i < t; i++) {
    cycle(s, U + 3, R + 1, D + 5, L + 7);
    cycle(s, U + 4, R + 4, D + 4, L + 4);
    cycle(s, U + 5, R + 7, D + 3, L + 1);
  }
}

function applyAtomic(state, face, turns) {
  const t = ((turns % 4) + 4) % 4;
  if (!t) return;
  if ("UDFBLR".includes(face)) {
    applyFace(state, face, t);
    return;
  }
  if (face === "r") {
    applyFace(state, "R", t);
    applyM(state, (4 - t) % 4);
    return;
  }
  if (face === "l") {
    applyFace(state, "L", t);
    applyM(state, t);
    return;
  }
  if (face === "u") {
    applyFace(state, "U", t);
    applyE(state, (4 - t) % 4);
    return;
  }
  if (face === "d") {
    applyFace(state, "D", t);
    applyE(state, t);
    return;
  }
  if (face === "f") {
    applyFace(state, "F", t);
    applyS(state, t);
    return;
  }
  if (face === "b") {
    applyFace(state, "B", t);
    applyS(state, (4 - t) % 4);
    return;
  }
  if (face === "M") {
    applyM(state, t);
    return;
  }
  if (face === "E") {
    applyE(state, t);
    return;
  }
  if (face === "S") {
    applyS(state, t);
    return;
  }
  if (face === "x") {
    applyFace(state, "R", t);
    applyM(state, (4 - t) % 4);
    applyFace(state, "L", (4 - t) % 4);
    return;
  }
  if (face === "y") {
    applyFace(state, "U", t);
    applyE(state, (4 - t) % 4);
    applyFace(state, "D", (4 - t) % 4);
    return;
  }
  if (face === "z") {
    applyFace(state, "F", t);
    applyS(state, t);
    applyFace(state, "B", (4 - t) % 4);
  }
}

export function solvedState() {
  const s = new Array(54);
  for (let i = 0; i < 54; i++) s[i] = i;
  return s;
}

export function isSolved(state) {
  for (let i = 0; i < 54; i++) if (state[i] !== i) return false;
  return true;
}

export function normalizeAlgText(raw) {
  let s = String(raw || "")
    .replace(/[’′]/g, "'")
    .trim();
  s = s.replace(/\(([^)]+)\)/g, (full, inner) => {
    const key = inner.trim().toLowerCase();
    if (ALG_ALIASES[key]) return "( " + ALG_ALIASES[key] + " )";
    return full;
  });
  s = s.replace(/\b(sexy|sledge|sune|anti-sune|antisune)\b/gi, (m) => {
    const key = m.toLowerCase();
    return ALG_ALIASES[key] || m;
  });
  return s;
}

export function tokenizeAlg(raw) {
  const s = normalizeAlgText(raw);

  function parseSeq(str) {
    let i = 0;
    const out = [];
    while (i < str.length) {
      while (i < str.length && /\s/.test(str[i])) i++;
      if (i >= str.length) break;
      if (str[i] === "(") {
        let depth = 1;
        let j = i + 1;
        while (j < str.length && depth) {
          if (str[j] === "(") depth++;
          else if (str[j] === ")") depth--;
          j++;
        }
        const inner = str.slice(i + 1, j - 1);
        let mult = 1;
        let invert = false;
        const m = str.slice(j).match(/^(\d+)?(')?/);
        if (m && (m[1] || m[2])) {
          if (m[1]) mult = Number(m[1]);
          if (m[2]) invert = true;
          j += m[0].length;
        }
        let innerToks = parseSeq(inner);
        if (invert) {
          innerToks = innerToks
            .slice()
            .reverse()
            .map(([f, t]) => [f, (4 - (t % 4)) % 4 || 4]);
        }
        for (let k = 0; k < mult; k++) out.push(...innerToks);
        i = j;
        continue;
      }
      const m = str.slice(i).match(/^([UDRLFBudrlfbMESxyz])w?(2'|2|'2|'|)?/);
      if (!m) {
        i++;
        continue;
      }
      let face = m[1];
      const token = m[0];
      if (token.includes("w")) face = face.toLowerCase();
      let suf = m[2] || "";
      let turns = 1;
      if (suf === "2" || suf === "2'" || suf === "'2") turns = 2;
      else if (suf === "'") turns = 3;
      out.push([face, turns]);
      i += token.length;
    }
    return out;
  }

  return parseSeq(s).filter(([, t]) => t % 4 !== 0);
}

export function applyAlg(state, tokens) {
  for (const [face, turns] of tokens) applyAtomic(state, face, turns);
  return state;
}

export function computeAlgOrder(raw, max = 1260) {
  const tokens = tokenizeAlg(raw);
  if (!tokens.length) return null;
  const state = solvedState();
  for (let n = 1; n <= max; n++) {
    applyAlg(state, tokens);
    if (isSolved(state)) return n;
  }
  return null;
}
