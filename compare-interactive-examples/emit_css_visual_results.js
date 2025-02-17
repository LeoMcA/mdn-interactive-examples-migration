import "dotenv/config";
import { diffInteractiveExamplesOutput } from "./compare.js";
import fs from "node:fs";

let f = "compare-results.json";
if (process.argv[2]) {
  f = process.argv[2];
}
const results = JSON.parse(fs.readFileSync(f));

const outDir = process.env.VISUAL_COMPARE_OUTPUT_FOLDER;

const sortedResults = Object.values(results)
  .flat()
  .filter((result) => result.comparisons)
  .sort((a, b) => {
    const maxDiffA = Math.max(...a.comparisons.map((c) => c.difference || 0));
    const maxDiffB = Math.max(...b.comparisons.map((c) => c.difference || 0));
    return maxDiffB - maxDiffA;
  });

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
      margin: 0 0 10px 0;
    }
  </style>
</head>
<body>
  ${sortedResults
    .map(
      (result) => `
      <div class="comparison">
        <h3>${result.slug}</h3>
        ${result.comparisons
          .map(
            (comparison, i) => `
          <div class="images">
            <div>
              <h4><small>Example #${i + 1}</small> <a href="${result.old.url}">
                Old version
              </a></h4>
              <img src="${comparison.oldPath}" alt="Old version">
            </div>
            <div>
              <h4><a href="${result.new.url}">New version</a></h4>
              <img src="${comparison.newPath}" alt="New version">
            </div>
            <div>
              <h4>Difference: ${comparison.difference}</h4>
              <img src="${comparison.diffPath}" alt="Difference">
            </div>
          </div>`
          )
          .join("\n")}
      </div>`
    )
    .join("\n")}
</body>
</html>
`;

fs.writeFileSync(`${outDir}/results.html`, html);
