import path from "node:path";
import fs from "node:fs";
import frontmatter from "front-matter";
import puppeteer, { Page } from "puppeteer";
import { exec } from "node:child_process";
import { promisify } from "node:util";
import { PNG } from "pngjs";
import gmModule from "gm";

const CONCURRENCY = 6;
const HEADLESS = true;
const BROWSER = "chrome";

export async function compareInteractiveJavascriptExamples(
  oldUrl,
  newUrl,
  slugs
) {
  console.log(`Comparing ${oldUrl} and ${newUrl}`);
  const ret = {};
  for (const locale of Object.keys(slugs)) {
    ret[locale] = await collectConsoleResults(
      oldUrl,
      newUrl,
      slugs[locale],
      locale
    );
  }
  return ret;
}

export async function compareVisualExamples(oldUrl, newUrl, slugs) {
  const outDir = process.env.VISUAL_COMPARE_OUTPUT_FOLDER;
  if (!outDir) {
    console.log("VISUAL_COMPARE_OUTPUT_FOLDER is not set");
    process.exit(1);
  }
  fs.mkdirSync(outDir, { recursive: true });
  fs.mkdirSync(path.join(outDir, "img"), { recursive: true });
  console.log(
    `Visually Comparing ${oldUrl} and ${newUrl}. Output is written to ${outDir}`
  );
  const ret = {};
  for (const locale of Object.keys(slugs)) {
    ret[locale] = await collectVisualResults(
      oldUrl,
      newUrl,
      slugs[locale],
      locale,
      outDir,
      true
    );
  }
  return ret;
}

export function translatedLocales() {
  if (!process.env.TRANSLATED_CONTENT_ROOT) {
    return [];
  }
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

export async function findSlugs(locale = "en-US", term, subpath) {
  const filesLookingInteresting = (
    await grepSystem(
      term,
      path.join(
        locale === "en-US"
          ? process.env.CONTENT_ROOT
          : process.env.TRANSLATED_CONTENT_ROOT,
        locale.toLowerCase(),
        subpath
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
async function collectVisualResults(
  oldUrl,
  newUrl,
  slugs,
  locale = "en-US",
  outDir
) {
  const browser = await puppeteer.launch({
    browser: BROWSER,
    headless: HEADLESS,
    args: [
      "--disable-features=site-per-process",
      "--disable-web-security",
      "--disable-features=IsolateOrigins",
      " --disable-site-isolation-trials",
    ],
    defaultViewport: {
      width: 1500,
      height: 3000,
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
          // use the old size as the base for the images to compare
          const oldResults = await getVisualOutputFromInteractiveExample(
            page,
            oldUrlForSlug,
            false
          );
          const newResults = await getVisualOutputFromInteractiveExample(
            page,
            newUrlForSlug,
            true
          );

          const comparisons = await compareScreenshotsBuffers(
            oldResults,
            newResults,
            slug,
            outDir
          );

          ret = {
            slug,
            locale,
            comparisons,
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

  await new Promise((resolve) => setTimeout(resolve, 2000)); // Add 1 second delay before closing browser
  await browser.close();
  return results;
}

/**
 * Helper function to get the image dimensions using GraphicsMagick.
 *
 * @param {Buffer} buffer - The image buffer.
 * @returns {Promise<{width: number, height: number}>} - The image size.
 */
function getImageSize(buffer) {
  return new Promise((resolve, reject) => {
    const tempFile = `/tmp/gm-size-${Math.random().toString(36).slice(5)}.png`;
    fs.writeFileSync(tempFile, buffer);
    gmModule(tempFile).size((err, size) => {
      fs.unlinkSync(tempFile);
      if (err) {
        return reject(err);
      }
      // console.log("size", size);
      resolve({ width: size.width, height: size.height });
    });
  });
}

/**
 * Helper function to extend an image (via canvas resize) to a given width and height,
 * filling the extra area with a white background.
 *
 * @param {Buffer} buffer - The original image buffer.
 * @param {number} width - The target width.
 * @param {number} height - The target height.
 * @returns {Promise<Buffer>} - A promise that resolves with the new PNG image buffer.
 */
function convertToExtendedImage(buffer, width, height) {
  return new Promise((resolve, reject) => {
    const tempFile = `/tmp/gm-rs-${Math.random().toString(36).slice(5)}.png`;
    fs.writeFileSync(tempFile, buffer);
    gmModule(tempFile)
      .background("white")
      .gravity("NorthWest")
      .extent(width, height)
      .toBuffer("PNG", (err, extendedBuffer) => {
        fs.unlinkSync(tempFile);
        if (err) {
          return reject(err);
        }
        resolve(extendedBuffer);
      });
  });
}

/**
 * Compares two screenshot images provided as buffers and returns the number of different pixels.
 * If differences are found, writes the diff image to /tmp/diff.png.
 *
 * @param {Buffer[]} buffers1 - Buffer of the first screenshot image.
 * @param {Buffer[]} buffers2 - Buffer of the second screenshot image.
 * @param {string} slug - the slug used to name the output images
 * @returns {Promise<{difference: number, oldPath: string, newPath: string, diffPath: string}[]>} - A promise that resolves to the number of differing pixels.
 */
async function compareScreenshotsBuffers(buffers1, buffers2, slug, outDir) {
  if (buffers1.length !== buffers2.length) {
    throw new Error("Both buffers must be of the same length.");
  }

  try {
    let results = [];
    for (let i = 0; i < buffers1.length; i++) {
      const buffer1 = buffers1[i];
      const buffer2 = buffers2[i];

      // Get image dimensions using GraphicsMagick
      const size1 = await getImageSize(buffer1);
      const size2 = await getImageSize(buffer2);
      const maxWidth = Math.max(size1.width, size2.width);
      const maxHeight = Math.max(size1.height, size2.height);

      // Create extended images (with white background and padded to max dimensions)
      const extendedBuffer1 = await convertToExtendedImage(
        buffer1,
        maxWidth,
        maxHeight
      );
      const extendedBuffer2 = await convertToExtendedImage(
        buffer2,
        maxWidth,
        maxHeight
      );

      // Write the extended images to disk
      const basename = slug.replace(/[^a-zA-Z0-9]/g, "_");
      const extendedOldImagePath = path.join(
        outDir,
        "img",
        `${basename}-old-${i}.png`
      );
      const extendedNewImagePath = path.join(
        outDir,
        "img",
        `${basename}-new-${i}.png`
      );
      fs.writeFileSync(extendedOldImagePath, extendedBuffer1);
      fs.writeFileSync(extendedNewImagePath, extendedBuffer2);

      const diffPath = path.join(outDir, "img", `${basename}-diff-${i}.png`);

      // Compare the extended images
      const result = await new Promise((resolve, reject) => {
        gmModule.compare(
          extendedOldImagePath,
          extendedNewImagePath,
          { file: diffPath, metric: "MSE", highlightStyle: "Assign" },
          (err, _equal, difference) => {
            if (err) {
              if (typeof err === "string") {
                reject(new Error(err));
              } else {
                reject(err);
              }
            } else {
              resolve({
                difference,
                diffPath: path.relative(outDir, diffPath),
                oldPath: path.relative(outDir, extendedOldImagePath),
                newPath: path.relative(outDir, extendedNewImagePath),
              });
            }
          }
        );
      });

      // Rewrite the diff image by subtracting the first image pixels from it:
      // await new Promise((resolve, reject) => {
      //   gmModule(diffPath)
      //     .composite(extendedOldImagePath)
      //     .compose("Difference")
      //     .write(diffPath, (err) => {
      //       if (err) {
      //         reject(err);
      //       } else {
      //         resolve();
      //       }
      //     });
      // });
      results.push(result);
    }
    return results;
  } catch (error) {
    console.log("error in compareScreenShotBuffers", error);
    throw error;
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
 * Get screenshots from an interactive example. Some example have multiple variants (CSS) and
 * need to take multiple screenshots to cover basic functionality.
 *
 * @param {Page} page - The page object representing the interactive example. This could be a browser or testing framework page instance.
 * @param {string} url - The URL of the interactive example to be processed.
 * @param {boolean} [queryCustomElement=false] - If true, the function will query for a specific custom element on the page.
 * @param {{width: number, height: number} | null} size - If set, clip the screenshot to this box
 * @returns {Promise<[UInt8Array]>} A promise that resolves with the png data and the size of the screenshot
 */
async function getVisualOutputFromInteractiveExample(
  page,
  url,
  queryCustomElement = false
) {
  try {
    let screenshot;
    let screenshotTarget;
    let isCSSChoice = false;
    await page.goto(url, { timeout: 10000, waitUntil: "networkidle2" });
    if (queryCustomElement) {
      // New custom element version
      const ie = await page.waitForSelector("interactive-example");
      const playController = await page.waitForSelector(
        "interactive-example >>> play-controller",
        { timeout: 5000 }
      );
      const playRunner = await playController.waitForSelector("play-runner");
      const outputIframe = await playRunner.waitForSelector(">>> iframe");
      const frame = await outputIframe.contentFrame();
      const body = await frame.waitForSelector("body");
      screenshotTarget = outputIframe;
      await new Promise((resolve) => setTimeout(resolve, 500));
      screenshot = await screenshotTarget.screenshot({
        path: `/tmp/screen-${queryCustomElement}.png`,
      });
      return [screenshot];
    } else {
      // Old iframe version
      const iframe = await page.waitForSelector("iframe.interactive", {
        timeout: 10000,
      });
      const frame = await iframe.contentFrame();
      const body = await frame.waitForSelector("body");

      // Now, we have either the tabbed interface or the css choices interface
      // if we can find a section#example-choice-list element, we are in CSS choice land,
      // otherwise we have the tabbed interface
      try {
        const choiceList = await frame.waitForSelector(
          "section#example-choice-list",
          { timeout: 100 }
        );
        const choices = await choiceList.$$(".example-choice");
        const output = await frame.waitForSelector("div#output", {
          timeout: 100,
        });
        screenshotTarget = output;
        // we have to do multiple screenshots for this
        let ret = [];
        await new Promise((resolve) => setTimeout(resolve, 500));
        for (const [index, choice] of choices.entries()) {
          await choice.hover();
          await choice.click();
          // we have a 0.3 .. 1.0 transition on the css, so wait a bit
          await new Promise((resolve) => setTimeout(resolve, 1200));
          screenshot = await screenshotTarget.screenshot({});
          ret.push(screenshot);
        }
        await output.hover();
        return ret;
      } catch (error) {
        // console.log("tabbed version", error);
        // tabbed
        const inner = await frame.waitForSelector("#output-iframe");
        // fudge to align prod:
        await frame.evaluate(() => {
          document.querySelector("#output-iframe").style.borderLeft =
            "1px solid transparent";
        });
        screenshotTarget = inner;
        const innerFrame = await inner.contentFrame();
        await innerFrame.waitForSelector("#html-output");
        await innerFrame.waitForFunction(
          () => document.readyState === "complete"
        );
        await new Promise((resolve) => setTimeout(resolve, 500));
        screenshot = await screenshotTarget.screenshot({
          path: `/tmp/screen-${queryCustomElement}.png`,
        });
        return [screenshot];
      }
    }
  } catch (error) {
    console.log(`error while processing ${url}: ${error}`);
    return [];
  }
}

const execAsync = promisify(exec);
async function grepSystem(searchTerm, directory) {
  try {
    // suppress exit status 1 of grep if there aren't any matches.
    const { stdout } = await execAsync(
      `grep -irl "${searchTerm}" "${directory}"; true`
    );
    return stdout;
  } catch (error) {
    throw new Error(`Error executing grep: ${error}`);
  }
}
