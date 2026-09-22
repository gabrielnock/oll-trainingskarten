import { readFileSync, writeFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const scrapePath = join(__dirname, "speedcubedb-oll.txt");

const raw = readFileSync(scrapePath, "utf8");
const blocks = raw.split(/^## OLL (\d+)\s*$/m).slice(1);

const cases = [];
for (let i = 0; i < blocks.length; i += 2) {
  const num = parseInt(blocks[i], 10);
  const body = blocks[i + 1];
  const lines = body.split("\n").map((l) => l.trim());

  let category = "";
  const setupIdx = lines.indexOf("setup:");
  if (setupIdx > 0) {
    for (let j = setupIdx - 1; j >= 0; j--) {
      if (lines[j] && lines[j] !== "-") {
        category = lines[j];
        break;
      }
    }
  }

  const stdIdx = lines.indexOf("Standard Alg:");
  let primary = "";
  let secondary = "";
  if (stdIdx >= 0) {
    const algLines = [];
    for (let j = stdIdx + 1; j < lines.length; j++) {
      const line = lines[j];
      if (line.startsWith("Community Votes:")) break;
      if (!line) continue;
      if (line === "Movecount:" || line.startsWith("Face Moves:")) break;
      algLines.push(line);
    }
    primary = algLines[0] || "";
    secondary = algLines[1] || "";
  }

  let setup = "";
  if (setupIdx >= 0) {
    for (let j = setupIdx + 1; j < lines.length; j++) {
      if (lines[j]) {
        setup = lines[j];
        break;
      }
    }
  }

  cases.push({
    num,
    category,
    setup,
    primary,
    secondary,
  });
}

cases.sort((a, b) => a.num - b.num);
writeFileSync(join(__dirname, "oll-cases.json"), JSON.stringify(cases, null, 2));
console.log(`Parsed ${cases.length} OLL cases`);
