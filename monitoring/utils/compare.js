import fs from "fs/promises";
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

  console.log(`📁 Base directory: ${baseDir}`);
  console.log(`📊 Processing ${Object.keys(regionsData).length} URLs...`);

  for (const url in regionsData) {
    console.log(`🔍 Processing URL: ${url}`);
    
    const driver = await new Builder()
      .forBrowser("chrome")
      .setChromeOptions(
        new chrome.Options().addArguments(
          "--headless",
          "--window-size=1920,1080",
          "--no-sandbox",
          "--disable-dev-shm-usage"
        )
      )
      .build();

    try {
      await driver.get(url);
      await delay(5000); // Wait for page to load

      const fullScreenshotBase64 = await driver.takeScreenshot();
      const fullScreenshotPath = path.join(newDir, `full-${sanitize(url)}.png`);
      await fs.writeFile(fullScreenshotPath, fullScreenshotBase64, "base64");

      const regions = regionsData[url].regions;
      console.log(`📋 Found ${Object.keys(regions).length} regions for ${url}`);

      for (const uuid in regions) {
        console.log(`🔧 Processing region: ${uuid}`);
        
        const { coords, imageurl } = regions[uuid];

        // Validate coordinates
        if (!coords || typeof coords.left !== 'number' || typeof coords.top !== 'number' || 
            typeof coords.width !== 'number' || typeof coords.height !== 'number') {
          console.error(`❌ Invalid coordinates for region ${uuid}:`, coords);
          continue;
        }

        // Ensure coordinates are positive and within bounds
        const safeCoords = {
          left: Math.max(0, Math.round(coords.left)),
          top: Math.max(0, Math.round(coords.top)),
          width: Math.max(1, Math.round(coords.width)),
          height: Math.max(1, Math.round(coords.height))
        };

        const newImagePath = path.join(newDir, `${uuid}.png`);
        const diffImagePath = path.join(diffsDir, `${uuid}.png`);

        try {
          // Extract the region from the full screenshot
          await sharp(fullScreenshotPath)
            .extract(safeCoords)
            .toFile(newImagePath);

          console.log(`✂️ Extracted region to: ${newImagePath}`);

          // Check if master image exists
          if (!imageurl || !fsSync.existsSync(imageurl)) {
            console.error(`❌ Master image not found: ${imageurl}`);
            continue;
          }

          // Compare images
          const mismatchPercent = await compareScreenshots(
            imageurl,
            newImagePath,
            diffImagePath
          );

          console.log(`📊 Region ${uuid}: ${mismatchPercent.toFixed(2)}% difference`);

          // Log significant differences
          if (mismatchPercent > 5) { //
            console.log(`⚠️  Significant difference detected in region ${uuid}: ${mismatchPercent.toFixed(2)}%`);
          } else if (mismatchPercent === 0) {
            console.log(`✅ Perfect match for region ${uuid}`);
          } else {
            console.log(`✅ Minor difference in region ${uuid}: ${mismatchPercent.toFixed(2)}%`);
          }

        } catch (regionError) {
          console.error(`❌ Error processing region ${uuid}:`, regionError.message);
        }
      }
    } catch (e) {
      console.error(`❌ Error processing URL ${url}:`, e.message);
    } finally {
      await driver.quit();
    }
  }

  console.log("✅ Full comparison completed for all URLs.");
  return "✅ Full comparison completed for all URLs.";
}

function compareScreenshots(imgPath1, imgPath2, diffPath) {
  return new Promise((resolve, reject) => {
    // Check if both files exist
    if (!fsSync.existsSync(imgPath1)) {
      return reject(new Error(`Master image not found: ${imgPath1}`));
    }
    if (!fsSync.existsSync(imgPath2)) {
      return reject(new Error(`New image not found: ${imgPath2}`));
    }

    try {
      const image1 = fsSync.readFileSync(imgPath1);
      const image2 = fsSync.readFileSync(imgPath2);

      resemble(image1)
        .compareTo(image2)
        .ignoreAntialiasing() // Often helpful for web screenshots
        // .ignoreColors() // Uncomment if you want to ignore color differences
        .onComplete((data) => {
          if (data.error) {
            return reject(new Error(data.error));
          }

          const misMatchPercent = parseFloat(data.misMatchPercentage);

          // Only save diff image if there's a meaningful difference
          if (misMatchPercent > 0.1) { // 0.1% threshold to avoid tiny differences
            try {
              fsSync.writeFileSync(diffPath, data.getBuffer());
              console.log(`💾 Diff image saved: ${diffPath}`);
            } catch (writeError) {
              console.error(`❌ Failed to save diff image: ${writeError.message}`);
            }
          }

          resolve(misMatchPercent);
        });
    } catch (readError) {
      reject(new Error(`Failed to read image files: ${readError.message}`));
    }
  });
}

function sanitize(url) {
  return url.replace(/[^a-z0-9]/gi, "_");
}