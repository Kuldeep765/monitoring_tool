import fs from "fs";
import sharp from "sharp";
import { PNG } from "pngjs";
import pixelmatch from "pixelmatch";
import { Builder } from "selenium-webdriver";
import chrome from "selenium-webdriver/chrome.js";

const ensureDirExists = (dir) => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
};

async function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function runFullComparison() {
  const regionsDataRaw = fs.readFileSync("data/master/regions.json", "utf-8");
  const regionsData = JSON.parse(regionsDataRaw);

  ensureDirExists("data/new");
  ensureDirExists("data/diffs");

  for (const url in regionsData) {
    const driver = await new Builder()
      .forBrowser("chrome")
      .setChromeOptions(
        new chrome.Options().addArguments("--headless", "--window-size=1920,1080")
      )
      .build();

    try {
      console.log(`🌐 Loading page: ${url}`);
      await driver.get(url);
      await delay(5000); // wait for full load

      const fullScreenshotBase64 = await driver.takeScreenshot();
      const fullScreenshotPath = `data/new/full-${sanitize(url)}.png`;
      fs.writeFileSync(fullScreenshotPath, fullScreenshotBase64, "base64");

      const regions = regionsData[url].regions;

      for (const uuid in regions) {
        const { coords, imageurl } = regions[uuid];

        const masterImagePath = imageurl;
        const newImagePath = `data/new/${uuid}.png`;
        const diffImagePath = `data/diffs/${uuid}.png`;

        await sharp(fullScreenshotPath)
          .extract({
            left: Math.round(coords.left),
            top: Math.round(coords.top),
            width: Math.round(coords.width),
            height: Math.round(coords.height),
          })
          .toFile(newImagePath);

        if (!fs.existsSync(masterImagePath)) {
          console.warn(`⚠️ Missing master image: ${masterImagePath}`);
          continue;
        }

        const changed = compareScreenshots(masterImagePath, newImagePath, diffImagePath);
        console.log(`🧠 Compared ${uuid}: ${changed} pixel(s) changed.`);
      }
    } catch (e) {
      console.error(`❌ Error comparing URL ${url}:`, e.message);
    } finally {
      await driver.quit();
    }
  }

  return "✅ Full comparison completed for all URLs.";
}

function compareScreenshots(imgPath1, imgPath2, diffPath) {
  const img1 = PNG.sync.read(fs.readFileSync(imgPath1));
  const img2 = PNG.sync.read(fs.readFileSync(imgPath2));

  const { width, height } = img1;
  const diff = new PNG({ width, height });

  const pixelsChanged = pixelmatch(
    img1.data,
    img2.data,
    diff.data,
    width,
    height,
    {
      threshold: 0.1,
      includeAA: true,
      alpha: 1,
    }
  );

  if (pixelsChanged > 0) {
    fs.writeFileSync(diffPath, PNG.sync.write(diff));
  }

  return pixelsChanged;
}

function sanitize(url) {
  return url.replace(/[^a-z0-9]/gi, "_");
}
