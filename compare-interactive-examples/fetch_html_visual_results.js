import "dotenv/config";
import { compareVisualExamples } from "./compare.js";
import fs from "node:fs";

let locale = "all";
if (process.argv[2]) {
  locale = process.argv[2];
}

let f = "compare-slugs.json";
if (process.argv[3]) {
  f = process.argv[3];
}

let slugs = JSON.parse(fs.readFileSync(f));
if (locale !== "all") {
  slugs = {
    [locale]: slugs[locale],
  };
}
const results = await compareVisualExamples(
  process.env.OLD_URL,
  process.env.NEW_URL,
  slugs
);
fs.writeFileSync("compare-results.json", JSON.stringify(results, null, 2));
