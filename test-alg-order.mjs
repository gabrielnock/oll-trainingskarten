import {
  computeAlgOrder,
  tokenizeAlg,
  applyAlg,
  solvedState,
  isSolved,
} from "./alg-order-lib.mjs";

const cases = [
  ["R", 4],
  ["R U R' U'", 6],
  ["R U R' U R U2 R'", 6],
  ["R U2 R' U' R U' R'", 6],
  ["F R U R' U' F'", 6],
  ["x", 4],
  ["y", 4],
  ["M", 4],
  ["R' F R F'", 6],
  ["R U R' U' R' F R F'", 3],
  ["(r U R' U') (r' F R F')", 3],
  ["r U R' U' r' F R F'", 3],
  ["R' F (Sexy) F' U R", 12],
  ["R' F (R U R' U') F' U R", 12],
  ["(R U R' U')", 6],
  ["r U R' U R U2 r'", 6],
];

let fail = 0;
for (const [alg, expect] of cases) {
  const got = computeAlgOrder(alg);
  const ok = got === expect;
  if (!ok) fail++;
  console.log((ok ? "OK " : "FAIL ") + JSON.stringify(alg) + " => " + got + " (expected " + expect + ")");
}

let s = solvedState();
applyAlg(s, tokenizeAlg("R R'"));
console.log("R R' solved", isSolved(s));
s = solvedState();
applyAlg(s, tokenizeAlg("R R R R"));
console.log("R4 solved", isSolved(s));

import { normalizeAlgText } from "./alg-order-lib.mjs";
const a = "R' F (Sexy) F' U R";
const b = "R' F (R U R' U') F' U R";
console.log("norm", normalizeAlgText(a));
console.log("tok a", tokenizeAlg(a));
console.log("tok b", tokenizeAlg(b));
console.log("order a/b", computeAlgOrder(a), computeAlgOrder(b));

process.exit(fail ? 1 : 0);
