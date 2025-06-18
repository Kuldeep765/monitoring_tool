import { Builder } from "selenium-webdriver";
import chrome from "selenium-webdriver/chrome.js";
import fs from "fs/promises";
import sharp from "sharp";
import { v4 as uuidv4 } from "uuid";
import pixelmatch from "pixelmatch";
import { PNG } from "pngjs";

const delay = (ms) => new Promise((res) => setTimeout(res, ms));

let cachedBaseDir = null;
const getBaseDir = () => {
  if (cachedBaseDir) return cachedBaseDir;

  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  const day = now.getDate().toString().padStart(2, "0");
  const hours = now.getHours();
  const minutes = now.getMinutes().toString().padStart(2, "0");
  const ampm = hours >= 12 ? "PM" : "AM";
  const hour12 = hours % 12 === 0 ? 12 : hours % 12;
  const timestamp = `${year}-${month}-${day}_${hour12}-${minutes}-${ampm}`;
  console.log("timestamp", timestamp);
  cachedBaseDir = `data/${timestamp}`;
  return cachedBaseDir;
};

function extractDecodedUrl(proxyUrl) {
  try {
    const urlObj = new URL(proxyUrl);
    const encoded = urlObj.searchParams.get("url");
    return decodeURIComponent(encoded);
  } catch (error) {
    console.error("Invalid proxy URL:", proxyUrl);
    return null;
  }
}

const baseDir = getBaseDir();
await fs.mkdir(baseDir, { recursive: true });

export async function captureMaster(url, coords) {
  const result = [];

  if (!coords || coords.length === 0) {
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

    await fs.mkdir(baseDir, { recursive: true });

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
      const filePath = `${baseDir}/${id}.png`;

      await sharp(buffer).extract(scaled).toFile(filePath);

      newRegions[id] = {
        coords: region,
        imageurl: filePath,
      };
    }

    const decodedUrl = extractDecodedUrl(url);
    if (!decodedUrl) return result;

    let existingData = {};
    try {
      const raw = await fs.readFile(`${baseDir}/regions.json`, "utf-8");
      existingData = JSON.parse(raw);
    } catch (e) {
      // No file yet, it's okay
    }

    if (!existingData[decodedUrl]) {
      existingData[decodedUrl] = { regions: {} };
    }

    existingData[decodedUrl].regions = {
      ...existingData[decodedUrl].regions,
      ...newRegions,
    };

    await fs.writeFile(
      `${baseDir}/regions.json`,
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

  const decodedUrl = extractDecodedUrl(url);
  if (!decodedUrl) return;

  const raw = await fs.readFile(`${baseDir}/regions.json`, "utf-8");
  const regionData = JSON.parse(raw)[decodedUrl]?.regions || {};

  // Read latest full screenshot (data/latest.png)
  const latestBuffer = await fs.readFile("data/latest.png");
  const latestMeta = await sharp(latestBuffer).metadata();

  // Loop over each region
  for (const [id, region] of Object.entries(regionData)) {
    // Assuming region.coords = { left, top, width, height }
    const { left, top, width, height } = region.coords;


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

      await fs.mkdir("data/diffs", { recursive: true });
      await fs.writeFile(`data/diffs/${id}-diff.png`, PNG.sync.write(png));

    
    } catch (error) {
      console.error(`Error processing region ${id}:`, error);
    }
  }
}

export async function captureMasterWithScroll(url, coords, iframeScroll) {
  const result = [];

  if (!coords || coords.length === 0) {
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

    if (iframeScroll && (iframeScroll.scrollX || iframeScroll.scrollY)) {
      await driver.executeScript(
        `window.scrollTo(${iframeScroll.scrollX}, ${iframeScroll.scrollY})`
      );
      await delay(2000);
    }

    const scrollInfo = await driver.executeScript(`
      return {
        scrollX: window.pageXOffset || document.documentElement.scrollLeft,
        scrollY: window.pageYOffset || document.documentElement.scrollTop,
        devicePixelRatio: window.devicePixelRatio || 1,
        viewportWidth: window.innerWidth,
        viewportHeight: window.innerHeight
      };
    `);

    const dpr = scrollInfo.devicePixelRatio;
    const imgBase64 = await driver.takeScreenshot();
    const buffer = Buffer.from(imgBase64, "base64");

    const metadata = await sharp(buffer).metadata();

    await fs.mkdir(baseDir, { recursive: true });

    const newRegions = {};
    for (const region of coords) {
      if (
        !region ||
        typeof region.left !== "number" ||
        typeof region.top !== "number" ||
        typeof region.width !== "number" ||
        typeof region.height !== "number"
      ) {
        continue;
      }

      const adjustedCoords = {
        left: region.left - scrollInfo.scrollX,
        top: region.top - scrollInfo.scrollY,
        width: region.width,
        height: region.height,
      };

      if (
        adjustedCoords.left + adjustedCoords.width < 0 ||
        adjustedCoords.top + adjustedCoords.height < 0 ||
        adjustedCoords.left > scrollInfo.viewportWidth ||
        adjustedCoords.top > scrollInfo.viewportHeight
      ) {
        continue;
      }

      const scaled = {
        left: Math.max(0, Math.round(adjustedCoords.left * dpr)),
        top: Math.max(0, Math.round(adjustedCoords.top * dpr)),
        width: Math.round(adjustedCoords.width * dpr),
        height: Math.round(adjustedCoords.height * dpr),
      };

      if (scaled.width <= 0 || scaled.height <= 0) continue;
      if (scaled.left >= metadata.width || scaled.top >= metadata.height)
        continue;

      if (scaled.left + scaled.width > metadata.width) {
        scaled.width = metadata.width - scaled.left;
      }

      if (scaled.top + scaled.height > metadata.height) {
        scaled.height = metadata.height - scaled.top;
      }

      if (scaled.width <= 0 || scaled.height <= 0) continue;

      try {
        const id = uuidv4();
        const filePath = `${baseDir}/${id}.png`;

        await sharp(buffer).extract(scaled).toFile(filePath);

        newRegions[id] = {
          coords: region,
          imageurl: filePath,
        };
      } catch (extractError) {
        console.error(`Failed to extract region:`, extractError);
        continue;
      }
    }

    const decodedUrl = extractDecodedUrl(url);
    if (!decodedUrl) return result;

    let existingData = {};
    try {
      const raw = await fs.readFile(`${baseDir}/regions.json`, "utf-8");
      existingData = JSON.parse(raw);
    } catch {
      // no file, okay
    }

    if (!existingData[decodedUrl]) {
      existingData[decodedUrl] = { regions: {} };
    }

    existingData[decodedUrl].regions = {
      ...existingData[decodedUrl].regions,
      ...newRegions,
    };

    await fs.writeFile(
      `${baseDir}/regions.json`,
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
export { getBaseDir };
