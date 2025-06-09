import fs from "fs";
import sharp from "sharp";
import { Builder } from "selenium-webdriver";
import chrome from "selenium-webdriver/chrome.js";
import resemble from "resemblejs";

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
        new chrome.Options().addArguments(
          "--headless",
          "--window-size=1920,1080"
        )
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

        try {
          const mismatchPercent = await compareScreenshots(
            masterImagePath,
            newImagePath,
            diffImagePath
          );
          console.log(`🧠 Compared ${uuid}: ${mismatchPercent}% mismatch.`);
        } catch (err) {
          console.error(`❌ Error comparing images for ${uuid}:`, err.message);
        }
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
  return new Promise((resolve, reject) => {
    const image1 = fs.readFileSync(imgPath1);
    const image2 = fs.readFileSync(imgPath2);

    resemble(image1)
      .compareTo(image2)
      // .ignoreColors() // optionally enable to ignore color differences
      // .ignoreAntialiasing() // optionally ignore anti-aliasing differences
      .onComplete((data) => {
        if (data.error) {
          return reject(new Error(data.error));
        }

        const misMatchPercent = parseFloat(data.misMatchPercentage);

        if (misMatchPercent > 0) {
          fs.writeFileSync(diffPath, data.getBuffer());
        }

        resolve(misMatchPercent);
      });
  });
}

function sanitize(url) {
  return url.replace(/[^a-z0-9]/gi, "_");
}
