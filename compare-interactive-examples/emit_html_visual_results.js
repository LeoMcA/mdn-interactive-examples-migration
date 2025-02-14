import 'dotenv/config'
import { diffInteractiveExamplesOutput } from './compare.js';
import fs from "node:fs";

let f = "compare-results.json";
if (process.argv[2]) {
  f = process.argv[2];
}
const results = JSON.parse(fs.readFileSync(f));
const outDir = process.env.VISUAL_COMPARE_OUTPUT_FOLDER;

const sortedResults = Object.values(results)
  .flat()
  .filter(result => result.comparison && result.comparison.difference)
  .sort((a, b) => b.comparison.difference - a.comparison.difference);

const html = `
<!DOCTYPE html>
<html>
<head>
  <style>
    body {
      font-family: sans-serif;
    }
    h3, h4 {
      font-weight: normal;
      margin: 0 0 10px 0;
    }
    .comparison {
      margin: 0 0 20px 0;
      padding: 10px;
      // border: 1px solid #ccc;
      background-color: #cccc;
    }
    .images {
      display: flex;
      gap: 10px;
    }
  </style>
</head>
<body>
  ${sortedResults.map(result => `
    <div class="comparison">
      <h3>${result.slug} | Difference: ${result.comparison.difference}</h3>
      <div class="images">
        <div>
          <h4><a href="${result.old.url}">Old version</a></h4>
          <img src="${result.comparison.oldPath}" alt="Old version">
        </div>
        <div>
          <h4><a href="${result.new.url}">New version</a></h4>
          <img src="${result.comparison.newPath}" alt="New version">
        </div>
        <div>
          <h4>Difference</h4>
          <img src="${result.comparison.diffPath}" alt="Difference">
        </div>
      </div>
    </div>
  `).join('')}
</body>
</html>
`;

fs.writeFileSync(`${outDir}/results.html`, html);
