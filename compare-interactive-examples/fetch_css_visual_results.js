import "dotenv/config";
import { compareVisualExamples } from "./compare.js";
import fs from "node:fs";

let f = "compare-slugs.json";
if (process.argv[2]) {
  f = process.argv[2];
}

const slugs = JSON.parse(fs.readFileSync(f));
const results = await compareVisualExamples(
  process.env.OLD_URL,
  process.env.NEW_URL,
  slugs
);
fs.writeFileSync("compare-results.json", JSON.stringify(results, null, 2));
