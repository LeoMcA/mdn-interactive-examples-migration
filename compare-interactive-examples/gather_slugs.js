import 'dotenv/config'
import { findSlugs } from './compare.js';
import fs from "node:fs";

const slugs = await findSlugs();
console.log(`Found ${slugs.length} slugs to check.`);
fs.writeFileSync("compare-slugs.json", JSON.stringify(slugs, null, 2));

