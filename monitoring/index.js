import express from "express";
import cors from "cors";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import { getCoords, saveCoords } from "./utils/storage.js";
import {
  captureMaster,
  captureLatest,
  captureMasterWithScroll,
} from "./utils/screenshot.js";
import proxyRoute from "./routes/proxy.js";
import { runFullComparison } from "./utils/compare.js";

const app = express();
const __dirname = path.dirname(fileURLToPath(import.meta.url));

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, "public")));

app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));
app.use("/proxy", proxyRoute);

// Homepage to enter URL
app.get("/", (req, res) => {
  res.render("index");
});

// Preview page with URL inside iframe
app.post("/preview", (req, res) => {
  const { url } = req.body;
  res.render("preview", { url });
});

app.get("/", async (req, res) => {
  const url = req.query.url;
  if (!url || !/^https?:\/\//.test(url)) {
    return res.status(400).send("Invalid URL");
  }

  try {
    const response = await fetch(url);
    const html = await response.text();
    res.send(html);
  } catch (error) {
    res.status(500).send("Failed to fetch target site.");
  }
});

app.post("/api/load-url", async (req, res) => {
  const { url } = req.body;

  if (!url || !/^https?:\/\//.test(url)) {
    return res.status(400).json({ error: "Invalid URL format" });
  }

  try {
    // Test if URL is accessible
    const response = await fetch(url, {
      method: "HEAD",
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      },
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    res.json({
      success: true,
      url: url,
      message: "URL is accessible",
    });
  } catch (error) {
    console.error("URL validation error:", error);
    res.status(400).json({
      error: `Cannot access URL: ${error.message}`,
    });
  }
});

// Enhanced save route with better error handling
app.post("/api/save", async (req, res) => {
  const { url, selections, iframeScroll } = req.body;

  if (!url || !/^https?:\/\//.test(url)) {
    return res.status(400).json({ error: "Invalid URL" });
  }

  if (!selections || selections.length === 0) {
    return res.status(400).json({ error: "No selections provided" });
  }

  let regionData = {};
  try {
    console.log(`🎯 Saving ${selections.length} regions for URL: ${url}`);
    console.log("Selections:", selections);
    console.log("Iframe scroll position:", iframeScroll);

    if (iframeScroll && (iframeScroll.scrollX || iframeScroll.scrollY)) {
      console.log("📸 Capturing with scroll offset...");
      regionData = await captureMasterWithScroll(url, selections, iframeScroll);
    } else {
      console.log("📸 Capturing without scroll offset...");
      regionData = await captureMaster(url, selections);
    }

    await saveCoords(url, regionData);

    console.log("✅ Successfully saved monitoring data");
    res.json({
      success: true,
      message: `Saved ${selections.length} region(s) for monitoring`,
      url: url,
      regionsCount: selections.length,
    });
  } catch (err) {
    console.error("❌ Save error:", err);
    res.status(500).json({
      error: "Failed to save or capture screenshots",
      details: err.message,
    });
  }
});

// Route to get saved URLs and their monitoring status
app.get("/api/monitored-urls", async (req, res) => {
  try {
    // You'll need to implement this in your storage.js
    // For now, return a simple response
    const monitoredUrls = await getMonitoredUrls();
    res.json({ urls: monitoredUrls });
  } catch (error) {
    console.error("Error fetching monitored URLs:", error);
    res.status(500).json({ error: "Failed to fetch monitored URLs" });
  }
});

// Route to delete monitoring for a specific URL
app.delete("/api/monitored-urls", async (req, res) => {
  const { url } = req.body;

  if (!url) {
    return res.status(400).json({ error: "URL is required" });
  }

  try {
    // You'll need to implement this in your storage.js
    await deleteMonitoredUrl(url);
    res.json({ success: true, message: "Monitoring removed for URL" });
  } catch (error) {
    console.error("Error removing monitored URL:", error);
    res.status(500).json({ error: "Failed to remove monitored URL" });
  }
});

async function getMonitoredUrls() {
  // This is a placeholder - implement based on your storage system
  try {
    const coordsData = await getCoords();
    return Object.keys(coordsData || {});
  } catch (error) {
    console.error("Error reading monitored URLs:", error);
    return [];
  }
}

// Helper function to delete monitored URL (add to storage.js)
async function deleteMonitoredUrl(url) {
  // This is a placeholder - implement based on your storage system
  try {
    const coordsData = await getCoords();
    if (coordsData && coordsData[url]) {
      delete coordsData[url];
      await saveCoords(url, null); // You may need to adjust this based on your storage implementation
    }
  } catch (error) {
    console.error("Error deleting monitored URL:", error);
    throw error;
  }
}

app.get("/run-compare", async (req, res) => {
  try {
    const message = await runFullComparison();
    res.send(message);
  } catch (error) {
    console.error(error);
    res.status(500).send("❌ Comparison failed: " + error.message);
  }
});

app.listen(3000, () => {
  console.log("🚀 Backend running on http://localhost:3000");
});
