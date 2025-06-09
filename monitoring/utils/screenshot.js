// utils/screenshot.js
import { Builder } from "selenium-webdriver";
import chrome from "selenium-webdriver/chrome.js";
import fs from "fs/promises";
import sharp from "sharp";
import { v4 as uuidv4 } from "uuid";
import pixelmatch from "pixelmatch";
import { PNG } from "pngjs";

const delay = (ms) => new Promise((res) => setTimeout(res, ms));

export async function captureMaster(url, coords) {
  const result = [];

  if (!coords || coords.length === 0) {
    console.log("No coords to capture.");
    return result;
  }

  const driver = await new Builder()
    .forBrowser("chrome")
    .setChromeOptions(
      new chrome.Options().addArguments(
        "--headless",
        "--disable-gpu",
        "--no-sandbox",
        "--window-size=1920,1080"
      )
    )
    .build();

  try {
    await driver.get(url);
    await delay(5000);

    const dpr = await driver.executeScript(
      "return window.devicePixelRatio || 1"
    );
    const imgBase64 = await driver.takeScreenshot();
    const buffer = Buffer.from(imgBase64, "base64");

    await fs.mkdir("data/master", { recursive: true });

    const newRegions = {};
    for (const region of coords) {
      const scaled = {
        left: Math.round(region.left * dpr),
        top: Math.round(region.top * dpr),
        width: Math.round(region.width * dpr),
        height: Math.round(region.height * dpr),
      };

      if (scaled.width === 0 || scaled.height === 0) continue;

      const id = uuidv4();
      const filePath = `data/master/${id}.png`;

      await sharp(buffer).extract(scaled).toFile(filePath);

      newRegions[id] = {
        coords: region,
        imageurl: filePath,
      };
    }

    // Read existing data
    let existingData = {};
    try {
      const raw = await fs.readFile("data/master/regions.json", "utf-8");
      existingData = JSON.parse(raw);
    } catch (e) {
      // No file yet, it's okay
    }

    // Merge into correct URL group
    if (!existingData[url]) {
      existingData[url] = {
        regions: {},
      };
    }

    existingData[url].regions = {
      ...existingData[url].regions,
      ...newRegions,
    };

    // Save updated structure
    await fs.writeFile(
      "data/master/regions.json",
      JSON.stringify(existingData, null, 2)
    );

    return result;
  } catch (err) {
    console.error("Failed to capture screenshot:", err);
    return [];
  } finally {
    await driver.quit();
  }
}

export async function captureLatest(url) {
  const driver = await new Builder().forBrowser("chrome").build();

  try {
    await driver.get(url);
    await delay(3000);
    const screenshot = await driver.takeScreenshot();
    await fs.writeFile("data/latest.png", screenshot, "base64");
  } finally {
    await driver.quit();
  }
}

export default async function compareScreens(url) {
  console.log("Comparing screenshot regions...");

  // Load the master data from regions.json
  const raw = await fs.readFile("data/master/regions.json", "utf-8");
  const regionData = JSON.parse(raw)[url]?.regions || {};

  // Read latest full screenshot (data/latest.png)
  const latestBuffer = await fs.readFile("data/latest.png");
  const latestMeta = await sharp(latestBuffer).metadata();

  // Loop over each region
  for (const [id, region] of Object.entries(regionData)) {
    // Assuming region.coords = { left, top, width, height }
    const { left, top, width, height } = region.coords;

    console.log(`Processing region ${id}:`, region.coords);

    // Bounds check to avoid "bad extract area"
    if (
      left < 0 ||
      top < 0 ||
      left + width > latestMeta.width ||
      top + height > latestMeta.height ||
      width <= 0 ||
      height <= 0
    ) {
      console.warn(
        `Skipping region ${id} - extract area is out of bounds or invalid.`
      );
      continue;
    }

    try {
      // Extract & get raw pixels for master image region
      const master = await sharp(region.imageurl)
        .resize(width, height)
        .raw()
        .toBuffer({ resolveWithObject: true });

      // Extract & get raw pixels for latest image region
      const latest = await sharp(latestBuffer)
        .extract({ left, top, width, height })
        .resize(width, height)
        .raw()
        .toBuffer({ resolveWithObject: true });

      // Allocate buffer for diff pixels
      const diff = Buffer.alloc(master.info.width * master.info.height * 4);

      // Compare pixels
      const diffPixels = pixelmatch(
        master.data,
        latest.data,
        diff,
        master.info.width,
        master.info.height,
        { threshold: 0.1 }
      );

      // Save diff image
      const png = new PNG({
        width: master.info.width,
        height: master.info.height,
      });
      png.data = diff;
      await fs.writeFile(`data/diffs/${id}-diff.png`, PNG.sync.write(png));

      console.log(
        `Saved diff image for region ${id}, diff pixels: ${diffPixels}`
      );
    } catch (error) {
      console.error(`Error processing region ${id}:`, error);
    }
  }
}

 