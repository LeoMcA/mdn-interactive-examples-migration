import 'dotenv/config'
import { findSlugs, translatedLocales } from './compare.js';
import fs from "node:fs";

const locales = ["en-US"];
locales.push(...translatedLocales());
const slugs = {};
for (const locale of locales) {
  slugs[locale] = await findSlugs(locale, "{{EmbedInteractiveExample", "web/html");
}
const count = Object.keys(slugs).reduce((ct, locale) => { 
  ct += slugs[locale].length;
  return ct
}, 0)
console.log(`Found ${count} slugs over ${Object.keys(slugs).length} locales. Writing to compare-slugs.json.`);
fs.writeFileSync("compare-slugs.json", JSON.stringify(slugs, null, 2));
