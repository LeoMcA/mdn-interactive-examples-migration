import "dotenv/config";
import { compareInteractiveExamples } from "./compare.js";
import fs from "node:fs";

let f = "compare-diffs.json";
if (process.argv[2]) {
  f = process.argv[2];
}
const diff = JSON.parse(fs.readFileSync(f));
const slugs = diff.reduce((prev, curr) => {
  curr.locale in prev
    ? prev[curr.locale].push(curr.slug)
    : (prev[curr.locale] = [curr.slug]);
  return prev;
}, {});
const results = await compareInteractiveExamples(
  process.env.OLD_URL,
  process.env.NEW_URL,
  slugs
);
fs.writeFileSync(
  "compare-results-from-diff.json",
  JSON.stringify(results, null, 2)
);
