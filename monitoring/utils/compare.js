import fs from "fs/promises"; // for async/await file I/O
import fsSync from "fs";
import path from "path";
import sharp from "sharp";
import { Builder } from "selenium-webdriver";
import chrome from "selenium-webdriver/chrome.js";
import resemble from "resemblejs";
import { getBaseDir } from "./screenshot.js";
async function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getLatestRegionFolder() {
  const dataDir = path.join(process.cwd(), "data");
  const folders = fsSync.readdirSync(dataDir).filter((f) => {
    const fullPath = path.join(dataDir, f);
    return (
      fsSync.statSync(fullPath).isDirectory() &&
      fsSync.existsSync(path.join(fullPath, "regions.json"))
    );
  });

  if (folders.length === 0) {
    throw new Error("No valid folders with regions.json found in /data");
  }

  folders.sort(); // oldest to newest
  return path.join(dataDir, folders[folders.length - 1]); // latest
}
function ensureDirExistsSync(dirPath) {
  if (!fsSync.existsSync(dirPath)) {
    fsSync.mkdirSync(dirPath, { recursive: true });
  }
}

export async function runFullComparison() {
  const baseDir = getLatestRegionFolder();
  const regionsPath = path.join(baseDir, "regions.json");
  const regionsDataRaw = await fs.readFile(regionsPath, "utf-8");
  const regionsData = JSON.parse(regionsDataRaw);

  const newDir = path.join(baseDir, "new");
  const diffsDir = path.join(baseDir, "diffs");

  ensureDirExistsSync(newDir);
  ensureDirExistsSync(diffsDir);

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
      await driver.get(url);
      await delay(5000);

      const fullScreenshotBase64 = await driver.takeScreenshot();
      const fullScreenshotPath = path.join(newDir, `full-${sanitize(url)}.png`);
      await fs.writeFile(fullScreenshotPath, fullScreenshotBase64, "base64");

      const regions = regionsData[url].regions;

      for (const uuid in regions) {
        const { coords, imageurl } = regions[uuid];

        const newImagePath = path.join(newDir, `${uuid}.png`);
        const diffImagePath = path.join(diffsDir, `${uuid}.png`);

        await sharp(fullScreenshotPath)
          .extract({
            left: Math.round(coords.left),
            top: Math.round(coords.top),
            width: Math.round(coords.width),
            height: Math.round(coords.height),
          })
          .toFile(newImagePath);

        try {
          const masterImagePath = imageurl;
          const mismatchPercent = await compareScreenshots(
            masterImagePath,
            newImagePath,
            diffImagePath
          );

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
