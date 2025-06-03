import express from "express";
import { Builder, By } from "selenium-webdriver";
import chrome from "selenium-webdriver/chrome.js";
import fs from "fs";
import { PNG } from "pngjs";
import pixelmatch from "pixelmatch";
import { v4 as uuidv4 } from "uuid";
import sharp from "sharp";
 
const app = express();
const PORT = 3000;
const URL = "https://monitoring-tools.vercel.app/";
 
function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
 
const ensureDirExists = (dir) => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
};
 
async function enableSelection(driver) {
  await driver.executeScript(() => {
    if (window._selectionOverlay) {
      window._selectionOverlay.remove();
    }
 
    window.selectedArea = null;
    const overlay = document.createElement("div");
    overlay.style.position = "fixed";
    overlay.style.top = "0";
    overlay.style.left = "0";
    overlay.style.width = "100vw";
    overlay.style.height = "100vh";
    overlay.style.zIndex = "999999";
    overlay.style.cursor = "crosshair";
    overlay.style.background = "rgba(0,0,0,0.0)";
 
    let box = null;
    let startX, startY;
 
    overlay.addEventListener("mousedown", (e) => {
      startX = e.clientX;
      console.log("startX", startX);
      startY = e.clientY;
      console.log("startY", startY);
 
      if (box) box.remove();
 
      box = document.createElement("div");
      console.log("box", box);
      box.style.position = "absolute";
      box.style.border = "2px solid red";
      box.style.pointerEvents = "none";
      overlay.appendChild(box);
    });
 
    overlay.addEventListener("mousemove", (e) => {
      if (!box) return;
      const x = Math.min(e.clientX, startX);
      console.log("x", x);
      const y = Math.min(e.clientY, startY);
      console.log("y", y);
      const width = Math.abs(e.clientX - startX);
      const height = Math.abs(e.clientY - startY);
 
      box.style.left = x + "px";
      box.style.top = y + "px";
      box.style.width = width + "px";
      box.style.height = height + "px";
    });
 
    overlay.addEventListener("mouseup", (e) => {
      const x = Math.min(e.clientX, startX);
      const y = Math.min(e.clientY, startY);
      const width = Math.abs(e.clientX - startX);
      const height = Math.abs(e.clientY - startY);
 
      window.selectedArea = { left: x, top: y, width, height };
      overlay.remove();
    });
 
    document.body.appendChild(overlay);
    window._selectionOverlay = overlay;
  });
}
 
async function captureMasterScreenshots(driver) {
  ensureDirExists("data/master");
 
  let counter = 1;
  while (true) {
    await enableSelection(driver);
    console.log(`🔲 Select region ${counter} (or click top-left to exit)...`);
 
    let selectedArea = null;
    while (!selectedArea) {
      await delay(5000);
      selectedArea = await driver.executeScript(
        "return window.selectedArea || null"
      );
    }
 
    if (selectedArea.left < 50 && selectedArea.top < 50) break;
 
    console.log("📸 Capturing region:", selectedArea);
 
    const uuid = uuidv4();
    const regionPath = `data/master/${uuid}.png`;
    const coordPath = `data/master/${uuid}.json`;
 
    const fullScreenshotBase64 = await driver.takeScreenshot();
    const buffer = Buffer.from(fullScreenshotBase64, "base64");
 
    // await sharp(buffer).extract(selectedArea).toFile(regionPath);
    // fs.writeFileSync(coordPath, JSON.stringify(selectedArea, null, 2));
 
    const dpr = await driver.executeScript(
      "return window.devicePixelRatio || 1"
    );
 
    const scaledArea = {
      left: Math.round(selectedArea.left * dpr),
      top: Math.round(selectedArea.top * dpr),
      width: Math.round(selectedArea.width * dpr),
      height: Math.round(selectedArea.height * dpr),
    };
 
    await sharp(buffer).extract(scaledArea).toFile(regionPath);
    fs.writeFileSync(coordPath, JSON.stringify(scaledArea, null, 2));
 
    counter++;
  }
 
  console.log("✅ Master screenshots and coordinates saved.");
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
 
async function compareWithMasterScreenshots(driver) {
  ensureDirExists("data/new");
  ensureDirExists("data/diffs");
 
  const coordFiles = fs
    .readdirSync("data/master")
    .filter((f) => f.endsWith(".json"));
  if (coordFiles.length === 0) {
    console.log("❌ No coordinates found. Please run /run-master first.");
    return;
  }
 
  const fullScreenshotBase64 = await driver.takeScreenshot();
  const newFullPath = "data/new/full.png";
  fs.writeFileSync(newFullPath, fullScreenshotBase64, "base64");
 
  for (const file of coordFiles) {
    const uuid = file.replace(".json", "");
    const coords = JSON.parse(fs.readFileSync(`data/master/${file}`, "utf-8"));
 
    const newPath = `data/new/${uuid}.png`;
    const oldPath = `data/master/${uuid}.png`;
    const diffPath = `data/diffs/${uuid}.png`;
 
    await sharp(newFullPath).extract(coords).toFile(newPath);
 
    if (!fs.existsSync(oldPath)) {
      console.warn(`⚠️ Missing old image: ${oldPath}`);
      continue;
    }
 
    const pixelsChanged = compareScreenshots(oldPath, newPath, diffPath);
    console.log(`🧠 Compared ${uuid}: ${pixelsChanged} pixel(s) changed.`);
  }
}
 
app.get("/run-master", async (req, res) => {
  const driver = await new Builder()
    .forBrowser("chrome")
    .setChromeOptions(
      new chrome.Options().addArguments("--window-size=1920,1080")
    )
    .build();
  try {
    await driver.get(URL);
    await delay(5000);
    await captureMasterScreenshots(driver);
    res.send("Master screenshots captured.");
  } finally {
    await driver.quit();
  }
});
 
app.get("/run-compare", async (req, res) => {
  const driver = await new Builder()
    .forBrowser("chrome")
    .setChromeOptions(
      new chrome.Options().addArguments("--headless", "--window-size=1920,1080")
    )
    .build();
  try {
    await driver.get(URL);
    await delay(5000);
    await compareWithMasterScreenshots(driver);
    res.send("Comparison complete.");
  } finally {
    await driver.quit();
  }
});
 
app.listen(PORT, () => {
  console.log(`🚀 Server started at http://localhost:${PORT}`);
});