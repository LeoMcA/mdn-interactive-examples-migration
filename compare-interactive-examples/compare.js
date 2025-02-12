import path from "node:path";
import fs from "node:fs";
import frontmatter from "front-matter";
import puppeteer, { Page } from "puppeteer";
import { exec } from "node:child_process";
import { promisify } from "node:util";
import pixelmatch from 'pixelmatch';
import { imageSize } from 'image-size'
import {PNG} from 'pngjs';

const CONCURRENCY = 6;
const HEADLESS = false;
const BROWSER = "chrome";

export async function compareInteractiveJavascriptExamples(oldUrl, newUrl, slugs) {
  console.log(`Comparing ${oldUrl} and ${newUrl}`);
  const ret = {};
  for (const locale of Object.keys(slugs)) {
    ret[locale] = await collectResults(oldUrl, newUrl, slugs[locale], locale);
  }
  return ret;
}

export async function compareInteractiveHTMLExamples(oldUrl, newUrl, slugs) { 
  console.log(`Visually Comparing ${oldUrl} and ${newUrl}`);
  const ret = {};
  for (const locale of Object.keys(slugs)) {
    ret[locale] = await collectVisualResults(oldUrl, newUrl, slugs[locale], locale);
  }
  return ret;
}

export function translatedLocales() {
  return fs
    .readdirSync(process.env.TRANSLATED_CONTENT_ROOT)
    .filter(
      (entry) =>
        !entry.startsWith(".") &&
        fs
          .lstatSync(path.join(process.env.TRANSLATED_CONTENT_ROOT, entry))
          .isDirectory()
    );
}

export async function findSlugs(locale = "en-US") {
  const filesLookingInteresting = (
    await grepSystem(
      "{{InteractiveExample",
      path.join(
        locale === "en-US"
          ? process.env.CONTENT_ROOT
          : process.env.TRANSLATED_CONTENT_ROOT,
        locale.toLowerCase(),
        "web",
        "javascript"
      )
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
  for (const locale of Object.keys(results)) {
    for (const result of results[locale]) {
      const oldConsole = massageOldOutput(result.old.consoleResult);
      const newConsole = massageNewOutput(result.new.consoleResult);
      if (oldConsole !== newConsole) {
        if (
          oldConsole &&
          newConsole &&
          [
            "Web/JavaScript/Reference/Global_Objects/Math/random",
            "Web/JavaScript/Reference/Global_Objects/Promise/finally",
          ].includes(result.slug)
        ) {
          // examples with random elements
          console.log(`allowed error on ${result.locale} ${result.slug}:
--- old ---
${oldConsole}
--- new ---
${newConsole}
---     ---`);
          continue;
        }
        diffs.push({
          slug: result.slug,
          locale: result.locale,
          old: { url: result.old.url, consoleResult: oldConsole },
          new: { url: result.new.url, consoleResult: newConsole },
        });
      }
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
  // different error output
  ret = ret.replace(/^[A-Za-z]*Error:/gm, "Error:");
  return ret;
}

/**
 *
 * @param {string} output
 * @returns {string}
 */
function massageNewOutput(output) {
  // different error output
  let ret = output.replace(/^[A-Za-z]*Error:/gm, "Error:");
  return ret;
}

/**
 * Collects visual results for interactive examples by processing both old and new URLs.
 *
 * @param {string} oldUrl - The base URL for the old version of interactive examples.
 * @param {string} newUrl - The base URL for the new version of interactive examples.
 * @param {Array<string>} slugs - An array of slugs identifying individual interactive examples.
 * @param {string} [locale="en-US"] - The locale used to locate the appropriate content.
 * @returns {Promise<any>} A promise that resolves with the collected visual results.
 */
async function collectVisualResults(oldUrl, newUrl, slugs, locale = "en-US") { 
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

  
  for (let i = 0; i < slugs.length; i += CONCURRENCY) {
    const batch = slugs.slice(i, i + CONCURRENCY);
    const batchResults = await Promise.all(
      batch.map(async (slug) => {
        const oldUrlForSlug = `${oldUrl}/${locale}/docs/${slug}`;
        const newUrlForSlug = `${newUrl}/${locale}/docs/${slug}`;
        let ret = {};
        let context;
        try {
          context = await browser.createBrowserContext();
          const page = await context.newPage();
          const oldResult = await getVisualOutputFromInteractiveExample(
            page,
            oldUrlForSlug,
            false
          );
          const newResult = await getVisualOutputFromInteractiveExample(
            page,
            newUrlForSlug,
            true
          );
          // const oldSize = imageSize(oldResult);
          // const newSize = imageSize(newResult);
          const img1 = PNG.sync.read("/tmp/test-new.png");
          const img2 = PNG.sync.read("/tmp/test-old.png");
          const {width, height} = img1;
          const diff = new PNG({ width, height });
          // console.log(oldSize, newSize, newResult.length, newSize.width * newSize.height * 1);
          // let diff = new Uint8Array();
          const numDiffPixels = pixelmatch(img1.data, img2.data, diff, width, height, {threshold: 0.1});
          // now make a diff old/new from the pixel values


          ret = {
            slug,
            locale,
            old: { url: oldUrlForSlug, pixelDiff: numDiffPixels },
            new: { url: newUrlForSlug, pixelDiff: numDiffPixels },
          };
          console.log(ret);
        } catch (error) {
          console.error(
            `Error processing ${oldUrlForSlug} and ${newUrlForSlug}:`,
            error
          );
          ret = {
            slug,
            locale,
            error,
          };
        } finally {
          await context?.close();
        }

        return ret;
      })
    );
    results.push(...batchResults);
  }


  await browser.close();
  return results;

}

// This function collects the interactive javascript example console output from the
// old and the new version of the examples found at URLs generated from the passed-in
// slugs
async function collectResults(oldUrl, newUrl, slugs, locale = "en-US") {
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
        const oldUrlForSlug = `${oldUrl}/${locale}/docs/${slug}`;
        const newUrlForSlug = `${newUrl}/${locale}/docs/${slug}`;
        let ret = {};
        let context;
        try {
          context = await browser.createBrowserContext();
          const page = await context.newPage();
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
            slug,
            locale,
            old: { url: oldUrlForSlug, consoleResult: oldConsoleResult },
            new: { url: newUrlForSlug, consoleResult: newConsoleResult },
          };
          console.log(ret);
        } catch (error) {
          console.error(
            `Error processing ${oldUrlForSlug} and ${newUrlForSlug}:`,
            error
          );
          ret = {
            slug,
            locale,
            error,
          };
        } finally {
          await context?.close();
        }

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

/**
 * Processes an interactive example page.
 *
 * @param {Page} page - The page object representing the interactive example. This could be a browser or testing framework page instance.
 * @param {string} url - The URL of the interactive example to be processed.
 * @param {boolean} [queryCustomElement=false] - If true, the function will query for a specific custom element on the page.
 * @returns {Promise<any>} A promise that resolves with the result of processing the page.
 */
async function getVisualOutputFromInteractiveExample(
  page,
  url,
  queryCustomElement = false
) { 
  let ret = "";
  try {
    await page.goto(url, { timeout: 10000 });
    if (queryCustomElement) {
      // custom element version
      const interactiveExample = await page.waitForSelector("interactive-example");

      const playController = await page.waitForSelector("interactive-example >>> play-controller", { timeout: 5000 });
      const playRunner = await playController.waitForSelector("play-runner");
      const outputIframeContent = await playRunner.waitForSelector(">>> iframe");
      // const outputBody = await outputIframeContent.waitForSelector("body");
      console.log("outputIframeContent", outputIframeContent)
      ret = await interactiveExample.screenshot({ path: `/tmp/test-new.png` });

    } else {
      // old iframe version
      const iframe = await page.waitForSelector("iframe.interactive", { timeout: 5000 });
      ret = iframe.screenshot({ path: `/tmp/test-old.png` });
      
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
