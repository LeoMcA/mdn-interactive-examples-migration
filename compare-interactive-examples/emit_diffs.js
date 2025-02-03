import 'dotenv/config'
import { diffInteractiveExamplesOutput } from './compare.js';
import fs from "node:fs";

let f = "compare-results.json";
if (process.argv[2]) {
  f = process.argv[2];
}
const fetch_data = JSON.parse(fs.readFileSync(f));
const results = await diffInteractiveExamplesOutput(fetch_data);
fs.writeFileSync("compare-diffs.json", JSON.stringify(results, null, 2));
