import puppeteer from "puppeteer";

const browser = await puppeteer.launch({
  browser: "firefox",
  headless: false,
});

const page = await browser.newPage()

await page.goto("https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array/from")

const iframe = await (await page.waitForSelector("iframe.interactive")).contentFrame();

await (await iframe.waitForSelector("#execute")).click()

const consoleText = await (await iframe.waitForSelector("#console")).evaluate(el => el.textContent)
console.log(consoleText);

await page.goto("http://localhost:5042/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array/from")

await page.click("interactive-example >>> #execute")

const console2Text = await (await page.waitForSelector("interactive-example >>> #console >>> ul")).evaluate(el => el.textContent)
console.log(console2Text);