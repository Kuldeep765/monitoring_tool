import { Builder } from "selenium-webdriver";
import chrome from "selenium-webdriver/chrome.js";
import fs from "fs/promises";
import sharp from "sharp";
import { v4 as uuidv4 } from "uuid";

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

    const dpr = await driver.executeScript("return window.devicePixelRatio || 1");
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
    await fs.writeFile("data/master/regions.json", JSON.stringify(existingData, null, 2));

    return result;
  } catch (err) {
    console.error("Failed to capture screenshot:", err);
    return [];
  } finally {
    await driver.quit();
  }
}
