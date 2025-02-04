import 'dotenv/config'
import { findSlugs, translatedLocales } from './compare.js';
import fs from "node:fs";

const locales = ["en-US"];
locales.push(...translatedLocales());
const slugs = {};
for (const locale of locales) {
  slugs[locale] = await findSlugs(locale);
}
console.log(`Found ${slugs.length} slugs to check.`);
fs.writeFileSync("compare-slugs.json", JSON.stringify(slugs, null, 2));

