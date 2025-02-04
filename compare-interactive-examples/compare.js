import path from "node:path";
import fs from "node:fs";
import frontmatter from "front-matter";
import puppeteer from "puppeteer";
import { exec } from "node:child_process";
import { promisify } from "node:util";

const CONCURRENCY = 6;
const HEADLESS = true;
const BROWSER = "chrome";

export async function compareInteractiveExamples(
  oldUrl,
  newUrl,
  slugs
){
  console.log(`Comparing ${oldUrl} and ${newUrl}`);
  let results = [];
  let locales = ["en-US"];
  let tl = fs.readdirSync(process.env.TRANSLATED_CONTENT_ROOT)
    .filter((entry) => !entry.startsWith(".") && fs.lstatSync(path.join(process.env.TRANSLATED_CONTENT_ROOT, entry)).isDirectory())
  locales.push(...tl);
  for (const locale of locales) {
    results.push(...await collectResults(oldUrl, newUrl, slugs, locale));
  }
  return results;
}

// Find eligible slugs to check.
export async function findSlugs(){
  const filesLookingInteresting = (
    await grepSystem(
      "EmbedInteractiveExample",
      path.join(process.env.CONTENT_ROOT, "en-us", "web", "javascript")
    )
  ).split("\n");

  const slugs = await Promise.all(
    filesLookingInteresting
      .filter((path) => !!path)
      .map(async (path) => {
        const markdown = await fs.promises.readFile(path, "utf-8");
        const frontMatter = frontmatter(markdown);
        return frontMatter.attributes.slug;
      })
  );

  return slugs;
}

export async function diffInteractiveExamplesOutput(results) { 
  let diffs = [];
  for (const result of results) {
    const oldConsole = massageOldOutput(result.old.consoleResult);
    const newConsole = result.new.consoleResult;
    if (oldConsole !== newConsole) {
      diffs.push({
        slug: result.slug,
        locale: result.locale,
        old: { url: result.old.url, consoleResult: oldConsole },
        new: { url: result.new.url, consoleResult: newConsole },
      });
    }
  }
  return diffs;
}

/**
 * 
 * @param {string} output 
 * @returns {string}
 */
function massageOldOutput(output) { 
  // remove leading > from each line
  let ret = output.replace(/^> +/gm, "");
  // handle quoting of single strings per line
  const lines = ret.split("\n").map((line) => {
    // if (line.startsWith('"') && line.endsWith('"')) {
    //   return line.slice(1, -1);
    // }
    return line.trim();
  });
  ret = lines.join("\n");
  return ret;
}

// This function collects the interactive javascript example console output from the
// old and the new version of the examples found at URLs generated from the passed-in
// slugs
async function collectResults(
  oldUrl,
  newUrl,
  slugs,
  locale = "en-US"
) {
  const browser = await puppeteer.launch({
    browser: BROWSER,
    headless: HEADLESS,
    defaultViewport: {
      width: 1250,
      height: 1300,
      isMobile: false,
      deviceScaleFactor: 1,
    },
  });

  const results = [];

  // Process slugs in batches of size CONCURRENCY.
  for (let i = 0; i < slugs.length; i += CONCURRENCY) {
    const batch = slugs.slice(i, i + CONCURRENCY);
    const batchResults = await Promise.all(
      batch.map(async (slug) => {
        // Create a new browser context and page for this slug
        const context = await browser.createBrowserContext();
        const page = await context.newPage();
        const oldUrlForSlug = `${oldUrl}/${locale}/docs/${slug}`;
        const newUrlForSlug = `${newUrl}/${locale}/docs/${slug}`;
        let ret = {};

        try {
          const oldConsoleResult = await getConsoleOutputFromJSExample(
            page,
            oldUrlForSlug,
            false
          );
          const newConsoleResult = await getConsoleOutputFromJSExample(
            page,
            newUrlForSlug,
            true
          );
          ret = {
            slug, locale,
            old: { url: oldUrlForSlug, consoleResult: oldConsoleResult },
            new: { url: newUrlForSlug, consoleResult: newConsoleResult }
          };
          console.log(ret);
        } catch (error) {
          console.error(
            `Error processing ${oldUrlForSlug} and ${newUrlForSlug}:`,
            error
          );
        }

        // Close the context after the test completes
        await context.close();
        return ret;
      })
    );
    results.push(...batchResults);
  }

  await browser.close();
  return results;
}

/**
This function is used to get the console output from the JS example
the `queryCustomElement` parameter is used to determine if the JS example is
inside a custom element (new version) or not.

@param {Page} page - The puppeteer page object
@param {string} url - The URL to load
@param {boolean} queryCustomElement - Whether to query the custom element or not
*/ 
async function getConsoleOutputFromJSExample(
  page,
  url,
  queryCustomElement = false
) {
  let ret = "";
  try {
    await page.goto(url, { timeout: 15000 });
    if (queryCustomElement) {
      const interactiveExample = await page.waitForSelector(
        "interactive-example"
      );
      const playController = await page.waitForSelector(">>> play-controller");
      const btn = await playController.waitForSelector("#execute");
      await btn.click();
      // wait for the console to populate
      const cons = await interactiveExample.waitForSelector(">>> #console");
      const consUl = await cons.waitForSelector(">>> ul");
      // wait for at least one li element to show up
      await consUl.waitForSelector("li");
      const output = (
        await consUl.$$eval("li", (lis) =>
          lis.map((li) => li.textContent?.trim() || "")
        )
      ).join("\n");
      ret = output;
    } else {
      const iframe = await (
        await page.waitForSelector("iframe.interactive")
      ).contentFrame();
      const btn = await iframe.waitForSelector("#execute", { timeout: 10000 });
      await btn.click();
      const consoleElement = await iframe.waitForSelector("#console");
      let attempts = 0;
      let consoleText = ""; 
      do {
        await new Promise((resolve) => setTimeout(resolve, attempts * 1000));
        attempts += 1;
        consoleText = await consoleElement.evaluate((el) => el.textContent);
      } while (consoleText === "" && attempts < 6);
      ret = consoleText.trim();
    }
  } catch (error) {
    console.log(`error when processing ${url}: ${error}`);
    return `--- ERROR --- ${error}`;
  }
  return ret;
}

const execAsync = promisify(exec);
async function grepSystem(searchTerm, directory) {
  try {
    const { stdout } = await execAsync(
      `grep -irl "${searchTerm}" "${directory}"`
    );
    return stdout;
  } catch (error) {
    throw new Error(`Error executing grep: ${error}`);
  }
}
