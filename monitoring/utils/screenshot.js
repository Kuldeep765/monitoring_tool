import { Builder } from "selenium-webdriver";
import chrome from "selenium-webdriver/chrome.js";
import fs from "fs/promises";
import sharp from "sharp";
import { v4 as uuidv4 } from "uuid";

const delay = (ms) => new Promise((res) => setTimeout(res, ms));

export async function captureMaster(url, coords) {
  if (!coords || coords.length === 0) {
    console.log("No coords to capture.");
    return;
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

    for (const region of coords) {
      const scaled = {
        left: Math.round(region.left * dpr),
        top: Math.round(region.top * dpr),
        width: Math.round(region.width * dpr),
        height: Math.round(region.height * dpr),
      };

      const id = uuidv4();

      await sharp(buffer).extract(scaled).toFile(`data/master/${id}.png`);

      // Save each region's coords separately or skip if you save all in one JSON file
      // Optional: Save per-crop coords for easier diff or later processing
      await fs.writeFile(
        `data/master/${id}.json`,
        JSON.stringify({ coords: region, url }, null, 2)
      );
    }
  } catch (err) {
    console.error("Failed to capture screenshot:", err);
  } finally {
    await driver.quit();
  }
}
