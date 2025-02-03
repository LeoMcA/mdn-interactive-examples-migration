import puppeteer from "puppeteer";

const browser = await puppeteer.launch({
  browser: "chrome",
  headless: false,
});

const page = await browser.newPage()

await page.setViewport({
  width: 1920,
  height: 1080,
  deviceScaleFactor: 1,
});

await page.goto("https://developer.mozilla.org/en-US/docs/Web/HTML/Element/datalist")

const iframe = await (await page.waitForSelector("iframe.interactive")).contentFrame();

const output = await (await iframe.waitForSelector("#output-iframe")).contentFrame();

const html = await output.waitForSelector("html");

await iframe.evaluate(() => {
  const element = document.querySelector('.output-label'); // Replace with the actual selector
  if (element) {
    element.style.display = 'none';
  }
});

const boundingBox = await html.boundingBox();

console.log(boundingBox)

await page.screenshot({
  path: "1.png",
  captureBeyondViewport: true,
  clip: {
    ...boundingBox,
    x: boundingBox.x + 10
  }
})

await page.goto("http://localhost:5042/en-US/docs/Web/HTML/Element/datalist")

const html2 = await (await (await page.waitForSelector("interactive-example >>> play-runner >>> iframe")).contentFrame()).waitForSelector("html")

const boundingBox2 = await html2.boundingBox()

console.log(boundingBox2)

await new Promise(r => setTimeout(r, 4000))

await page.screenshot({
  path: "2.png",
  captureBeyondViewport: true,
  clip: {
    x: boundingBox2.x + 11,
    y: boundingBox2.y,
    width: boundingBox.width,
    height: boundingBox.height
  }
})

console.log("done")