import path from "node:path";
import fs from "node:fs";
import frontmatter from "front-matter";
import puppeteer, { Page } from "puppeteer";
import { exec } from "node:child_process";
import { promisify } from "node:util";
import { PNG } from 'pngjs';
import gmModule from 'gm';

const CONCURRENCY = 6;
const HEADLESS = true;
const BROWSER = "chrome";

export async function compareInteractiveJavascriptExamples(oldUrl, newUrl, slugs) {
  console.log(`Comparing ${oldUrl} and ${newUrl}`);
  const ret = {};
  for (const locale of Object.keys(slugs)) {
    ret[locale] = await collectConsoleResults(oldUrl, newUrl, slugs[locale], locale);
  }
  return ret;
}

export async function compareInteractiveHTMLExamples(oldUrl, newUrl, slugs) { 
  const outDir = process.env.VISUAL_COMPARE_OUTPUT_FOLDER;
  if (!outDir) { 
    console.log("VISUAL_COMPARE_OUTPUT_FOLDER is not set");
    process.exit(1)
  }
  fs.mkdirSync(outDir, { recursive: true });
  fs.mkdirSync(path.join(outDir, "img"), { recursive: true });
  console.log(`Visually Comparing ${oldUrl} and ${newUrl}. Output is written to ${outDir}`);
  const ret = {};
  for (const locale of Object.keys(slugs)) {
    ret[locale] = await collectVisualResults(oldUrl, newUrl, slugs[locale], locale, outDir);
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
      "{{EmbedInteractiveExample",
      path.join(
        locale === "en-US"
          ? process.env.CONTENT_ROOT
          : process.env.TRANSLATED_CONTENT_ROOT,
        locale.toLowerCase(),
        "web",
        "html"
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
async function collectVisualResults(oldUrl, newUrl, slugs, locale = "en-US", outDir) { 
  const browser = await puppeteer.launch({
    browser: BROWSER,
    headless: HEADLESS,
    defaultViewport: {
      width: 1500,
      height: 3000,
      isMobile: false,
      deviceScaleFactor: 1,
    },
  });
  const results = [];

  // await new Promise(resolve => setTimeout(resolve, 60000)); // Add 1 second delay before closing browser

  
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
          // use the old size as the base for the images to compare
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

          const comparison = await compareScreenshotsBuffers(oldResult, newResult, slug, outDir);

          ret = {
            slug,
            locale,
            comparison,
            old: { url: oldUrlForSlug },
            new: { url: newUrlForSlug },
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

  await new Promise(resolve => setTimeout(resolve, 2000)); // Add 1 second delay before closing browser
  await browser.close();
  return results;
}

/**
 * Compares two screenshot images provided as buffers and returns the number of different pixels.
 * If differences are found, writes the diff image to /tmp/diff.png.
 *
 * @param {Buffer} buffer1 - Buffer of the first screenshot image.
 * @param {Buffer} buffer2 - Buffer of the second screenshot image.
 * @param {string} slug - the slug used to name the output images
 * @returns {Promise<{difference: number, oldPath: string, newPath: string, diffPath: string}>} - A promise that resolves to the number of differing pixels.
 */
async function compareScreenshotsBuffers(buffer1, buffer2, slug, outDir) {
  try {

      // Parse the PNG images from the buffers synchronously
      const img1 = PNG.sync.read(Buffer.from(buffer1));
      const img2 = PNG.sync.read(Buffer.from(buffer2));

      // Calculate the maximum dimensions needed
      const maxWidth = Math.max(img1.width, img2.width);
      const maxHeight = Math.max(img1.height, img2.height);
      // Create new PNGs with the maximum dimensions (white background)
      const extendedImg1 = new PNG({ width: maxWidth, height: maxHeight });
      const extendedImg2 = new PNG({ width: maxWidth, height: maxHeight });
      // Fill with white pixels (255 for all RGBA channels)
      for (let y = 0; y < maxHeight; y++) {
        for (let x = 0; x < maxWidth; x++) {
          const idx = (y * maxWidth + x) << 2;
          extendedImg1.data[idx] = 255;     // R
          extendedImg1.data[idx + 1] = 255; // G
          extendedImg1.data[idx + 2] = 255; // B
          extendedImg1.data[idx + 3] = 255; // A
          
          extendedImg2.data[idx] = 255;     // R
          extendedImg2.data[idx + 1] = 255; // G
          extendedImg2.data[idx + 2] = 255; // B
          extendedImg2.data[idx + 3] = 255; // A
        }
      }      

      // Copy original images into the extended ones
      for (let y = 0; y < img1.height; y++) {
        for (let x = 0; x < img1.width; x++) {
          const srcIdx = (y * img1.width + x) << 2;
          const destIdx = (y * maxWidth + x) << 2;
          extendedImg1.data[destIdx] = img1.data[srcIdx];
          extendedImg1.data[destIdx + 1] = img1.data[srcIdx + 1];
          extendedImg1.data[destIdx + 2] = img1.data[srcIdx + 2];
          extendedImg1.data[destIdx + 3] = img1.data[srcIdx + 3];
        }
      }

      for (let y = 0; y < img2.height; y++) {
        for (let x = 0; x < img2.width; x++) {
          const srcIdx = (y * img2.width + x) << 2;
          const destIdx = (y * maxWidth + x) << 2;
          extendedImg2.data[destIdx] = img2.data[srcIdx];
          extendedImg2.data[destIdx + 1] = img2.data[srcIdx + 1];
          extendedImg2.data[destIdx + 2] = img2.data[srcIdx + 2];
          extendedImg2.data[destIdx + 3] = img2.data[srcIdx + 3];
        }
      }

      // Write the extended images
      const basename = slug.replace(/[^a-zA-Z0-9]/g, '_');
      const extendedOldImagePath = path.join(outDir, "img", `${basename}-old.png`);
      const extendedNewImagePath = path.join(outDir, "img", `${basename}-new.png`);
      const extendedOldBuffer = PNG.sync.write(extendedImg1);
      const extendedNewBuffer = PNG.sync.write(extendedImg2);
      fs.writeFileSync(extendedOldImagePath, extendedOldBuffer);
      fs.writeFileSync(extendedNewImagePath, extendedNewBuffer);
      
      
      const diffPath = path.join(outDir, "img", `${basename}-diff.png`);

      // compare using graphicsmagick
      return new Promise((resolve, reject) => {
        gmModule.compare(
          extendedOldImagePath,
          extendedNewImagePath,
          { file: diffPath, metric: 'MSE', "highlight-style": "XOR" },
          (err, _equal, difference) => {
            if (err) {
              if (typeof err === 'string') {
                reject(new Error(err));
              } else {
                reject(err);
              }
            } else {
              resolve(
                {
                  difference,
                  diffPath,
                  oldPath: path.relative(outDir, extendedOldImagePath),
                  newPath: path.relative(outDir, extendedNewImagePath)
                });
            }
          }
        );
      });
    
    } catch (error) {
      console.log("error in compareScreenShotBuffers", error)
      throw(error)
    }
}

// This function collects the interactive javascript example console output from the
// old and the new version of the examples found at URLs generated from the passed-in
// slugs
async function collectConsoleResults(oldUrl, newUrl, slugs, locale = "en-US") {
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
 * Get a screenshot from an interactive example.
 *
 * @param {Page} page - The page object representing the interactive example. This could be a browser or testing framework page instance.
 * @param {string} url - The URL of the interactive example to be processed.
 * @param {boolean} [queryCustomElement=false] - If true, the function will query for a specific custom element on the page.
 * @param {{width: number, height: number} | null} size - If set, clip the screenshot to this box
 * @returns {Promise<UInt8Array | null>} A promise that resolves with the png data and the size of the screenshot
 */
async function getVisualOutputFromInteractiveExample(
  page,
  url,
  queryCustomElement = false,
) { 
   try {
    let screenshot;
    let interactiveExample;
    await page.goto(url, { timeout: 10000 });
    // await page.evaluate(() => {
    //   const element = document.querySelector("#try_it");
    //   element.scrollIntoView({block: "start", inline: "center", behavior: "instant"})
    // });
    if (queryCustomElement) {
      // custom element version
      // const targetElement = await page.$("body");
      // await targetElement.scrollIntoView({ behavior: 'smooth', block: 'start' });
      interactiveExample = await page.waitForSelector("interactive-example");
      const playController = await page.waitForSelector("interactive-example >>> play-controller", { timeout: 5000 });
      const playRunner = await playController.waitForSelector("play-runner");
      const outputIframe = await playRunner.waitForSelector(">>> iframe");
      const frame = await outputIframe.contentFrame();
      const body = await frame.waitForSelector("body");
      interactiveExample = outputIframe;
    } else {
      // old iframe version
      // const targetElement = await page.$("body");
      // await targetElement.scrollIntoView({ behavior: 'smooth', block: 'start' });
      interactiveExample = await page.waitForSelector("iframe.interactive", { timeout: 5000 });
      const frame = await interactiveExample.contentFrame();
      const body = await frame.waitForSelector("body");
      const inner = await frame.waitForSelector("#output-iframe");
      interactiveExample = inner;
    }
    await new Promise(resolve => setTimeout(resolve, 500));
    screenshot = await interactiveExample.screenshot({ path: `/tmp/screen-${queryCustomElement}.png` });
    return screenshot;
  } catch (error) {
    console.log(`error while processing ${url}: ${error}`);
    return null
  }
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
