// screenshot.js

import { Builder } from "selenium-webdriver";
import chrome from "selenium-webdriver/chrome.js";
import fs from "fs/promises";
import path from "path";
import sharp from "sharp";
import { PNG } from "pngjs";
import pixelmatch from "pixelmatch";
import { v4 as uuidv4 } from "uuid";

const delay = ms => new Promise(res => setTimeout(res, ms));

export async function captureMaster(url, coords) {
  const driver = await new Builder()
    .forBrowser("chrome")
    .setChromeOptions(new chrome.Options().addArguments("--headless", "--window-size=1920,1080"))
    .build();

  try {
    await driver.get(url);
    await delay(5000);

    const dpr = await driver.executeScript("return window.devicePixelRatio || 1");
    const img = await driver.takeScreenshot();
    const buffer = Buffer.from(img, "base64");

    // Ensure master folder exists
    await fs.mkdir("data/master", { recursive: true });

    // Save each cropped region + its coords json
    await Promise.all(coords.map(async (region) => {
      const scaled = {
        left: Math.round(region.left * dpr),
        top: Math.round(region.top * dpr),
        width: Math.round(region.width * dpr),
        height: Math.round(region.height * dpr),
      };

      const id = uuidv4();

      // Save PNG
      await sharp(buffer).extract(scaled).toFile(`data/master/${id}.png`);

      // Save coords JSON
      await fs.writeFile(`data/master/${id}.json`, JSON.stringify({ coords: region }, null, 2));
    }));

  } finally {
    await driver.quit();
  }
}

export async function compareScreens(url, coords) {
  const driver = await new Builder()
    .forBrowser("chrome")
    .setChromeOptions(new chrome.Options().addArguments("--headless", "--window-size=1920,1080"))
    .build();

  try {
    await driver.get(url);
    await delay(5000);

    const dpr = await driver.executeScript("return window.devicePixelRatio || 1");
    const img = await driver.takeScreenshot();
    const buffer = Buffer.from(img, "base64");

    await fs.mkdir("data/new", { recursive: true });
    await fs.mkdir("data/diffs", { recursive: true });

    const masterFiles = (await fs.readdir("data/master")).filter(f => f.endsWith(".png"));

    // Compare all master regions with current screenshot
    for (const file of masterFiles) {
      // Load coords for this region
      const jsonPath = path.join("data/master", file.replace(".png", ".json"));
      const coordDataRaw = await fs.readFile(jsonPath, "utf8");
      const { coords: region } = JSON.parse(coordDataRaw);

      const scaled = {
        left: Math.round(region.left * dpr),
        top: Math.round(region.top * dpr),
        width: Math.round(region.width * dpr),
        height: Math.round(region.height * dpr),
      };

      const newPath = path.join("data/new", file);
      const diffPath = path.join("data/diffs", file);

      // Crop current screenshot
      await sharp(buffer).extract(scaled).toFile(newPath);

      // Load images
      const img1 = PNG.sync.read(await fs.readFile(path.join("data/master", file)));
      const img2 = PNG.sync.read(await fs.readFile(newPath));

      const diff = new PNG({ width: img1.width, height: img1.height });

      const changedPixels = pixelmatch(
        img1.data, img2.data, diff.data, img1.width, img1.height,
        { threshold: 0.1 }
      );

      if (changedPixels > 0) {
        await fs.writeFile(diffPath, PNG.sync.write(diff));
      }
    }

  } finally {
    await driver.quit();
  }
}
