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

export async function captureMasterWithScroll(url, coords, iframeScroll) {
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

    // Scroll to match the iframe's scroll position
    if (iframeScroll && (iframeScroll.scrollX || iframeScroll.scrollY)) {
      await driver.executeScript(
        `window.scrollTo(${iframeScroll.scrollX}, ${iframeScroll.scrollY})`
      );
      await delay(2000); // Wait for scroll to complete
      console.log(
        `Scrolled to position: ${iframeScroll.scrollX}, ${iframeScroll.scrollY}`
      );
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

    console.log("Browser scroll position after adjustment:", scrollInfo);

    const dpr = scrollInfo.devicePixelRatio;
    const imgBase64 = await driver.takeScreenshot();
    const buffer = Buffer.from(imgBase64, "base64");

    // Get image metadata to check bounds
    const metadata = await sharp(buffer).metadata();
    console.log(
      `Screenshot dimensions: ${metadata.width}x${metadata.height}, DPR: ${dpr}`
    );

    await fs.mkdir("data/master", { recursive: true });

    const newRegions = {};
    for (const region of coords) {
      console.log(`Processing region:`, region);

      // Validate input coordinates
      if (
        !region ||
        typeof region.left !== "number" ||
        typeof region.top !== "number" ||
        typeof region.width !== "number" ||
        typeof region.height !== "number"
      ) {
        console.warn("Invalid region data:", region);
        continue;
      }

      // Since we've scrolled the browser to match iframe scroll,
      // we need to adjust coordinates to be relative to viewport
      const adjustedCoords = {
        left: region.left - scrollInfo.scrollX,
        top: region.top - scrollInfo.scrollY,
        width: region.width,
        height: region.height,
      };

      console.log(`Original coords:`, region);
      console.log(`Adjusted for viewport:`, adjustedCoords);

      // Check if the region is actually visible in the current viewport
      if (
        adjustedCoords.left + adjustedCoords.width < 0 ||
        adjustedCoords.top + adjustedCoords.height < 0 ||
        adjustedCoords.left > scrollInfo.viewportWidth ||
        adjustedCoords.top > scrollInfo.viewportHeight
      ) {
        console.warn(
          `Skipping region - not visible in current viewport:`,
          adjustedCoords
        );
        continue;
      }

      const scaled = {
        left: Math.max(0, Math.round(adjustedCoords.left * dpr)),
        top: Math.max(0, Math.round(adjustedCoords.top * dpr)),
        width: Math.round(adjustedCoords.width * dpr),
        height: Math.round(adjustedCoords.height * dpr),
      };

      // Bounds checking
      if (scaled.width <= 0 || scaled.height <= 0) {
        console.warn(
          `Skipping region - invalid dimensions: ${scaled.width}x${scaled.height}`
        );
        continue;
      }

      if (scaled.left >= metadata.width || scaled.top >= metadata.height) {
        console.warn(
          `Skipping region - coordinates out of bounds: left=${scaled.left}, top=${scaled.top}`
        );
        continue;
      }

      // Adjust dimensions if they extend beyond image bounds
      if (scaled.left + scaled.width > metadata.width) {
        scaled.width = metadata.width - scaled.left;
        console.warn(`Adjusted width to fit image bounds: ${scaled.width}`);
      }

      if (scaled.top + scaled.height > metadata.height) {
        scaled.height = metadata.height - scaled.top;
        console.warn(`Adjusted height to fit image bounds: ${scaled.height}`);
      }

      // Final check after adjustments
      if (scaled.width <= 0 || scaled.height <= 0) {
        console.warn(
          `Skipping region after bounds adjustment - invalid dimensions`
        );
        continue;
      }

      try {
        const id = uuidv4();
        const filePath = `data/master/${id}.png`;

        console.log(
          `Extracting region: left=${scaled.left}, top=${scaled.top}, width=${scaled.width}, height=${scaled.height}`
        );

        await sharp(buffer).extract(scaled).toFile(filePath);

        newRegions[id] = {
          coords: region, // Store original document-relative coordinates
          imageurl: filePath,
        };

        console.log(`Successfully saved region ${id} to ${filePath}`);
      } catch (extractError) {
        console.error(`Failed to extract region:`, extractError);
        console.error(`Region data:`, scaled);
        continue;
      }
    }

    // Save regions data
    let existingData = {};
    try {
      const raw = await fs.readFile("data/master/regions.json", "utf-8");
      existingData = JSON.parse(raw);
    } catch (e) {
      console.log("No existing regions.json file, creating new one");
    }

    if (!existingData[url]) {
      existingData[url] = {
        regions: {},
      };
    }

    existingData[url].regions = {
      ...existingData[url].regions,
      ...newRegions,
    };

    await fs.writeFile(
      "data/master/regions.json",
      JSON.stringify(existingData, null, 2)
    );

    console.log(`Saved ${Object.keys(newRegions).length} regions for ${url}`);
    return result;
  } catch (err) {
    console.error("Failed to capture screenshot:", err);
    return [];
  } finally {
    await driver.quit();
  }
}
 