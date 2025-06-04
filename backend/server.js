import express from "express";
import cors from "cors";
import fs from "fs/promises";
import path from "path";
import puppeteer from "puppeteer";
import { captureMaster, compareScreens } from "./utils/screenshot.js";
import { saveCoords, getCoords } from "./utils/storage.js";

// Ensure required directories exist
const ensureDirectories = async () => {
  const dirs = ["data/master", "data/new", "data/diffs"];
  for (const dir of dirs) {
    await fs.mkdir(dir, { recursive: true }).catch(console.error);
  }
};

// Create directories on startup
ensureDirectories();

const app = express();
app.use(cors());
app.use(express.json());

app.post("/api/save", async (req, res) => {
  try {
    console.log("Received save request with body:", JSON.stringify(req.body, null, 2));
    
    const { url, selections } = req.body;
    
    if (!url || !selections || !Array.isArray(selections)) {
      console.error("Invalid request data:", { url, selections });
      return res.status(400).json({ error: "Invalid request data. URL and selections array are required." });
    }

    if (selections.length === 0) {
      console.error("No selections provided");
      return res.status(400).json({ error: "At least one selection is required" });
    }

    // Validate each selection has required properties
    const validSelections = selections.every(s => 
      typeof s.left === 'number' && 
      typeof s.top === 'number' && 
      typeof s.width === 'number' && 
      typeof s.height === 'number'
    );

    if (!validSelections) {
      console.error("Invalid selection format:", selections);
      return res.status(400).json({ error: "Invalid selection format. Each selection must have left, top, width, and height as numbers." });
    }
    
    console.log("Processing selections:", selections);
    await saveCoords(url, selections);
    await captureMaster(url, selections);
    res.json({ success: true, message: "Regions saved successfully" });
  } catch (error) {
    console.error("Error in /api/save:", error);
    res
      .status(500)
      .json({ error: "Internal server error", message: error.message });
  }
});

app.get("/api/compare", async (req, res) => {
  const url = req.query.url;
  const selections = await getCoords(url);
  await compareScreens(url, selections);
  res.json({ success: true, message: "Comparison done" });
});

app.get("/proxy", async (req, res) => {
  let browser = null;
  
  try {
    const targetUrl = req.query.url;
    
    if (!targetUrl) {
      return res.status(400).json({ error: "URL parameter is required" });
    }

    // Launch browser with minimal features
    browser = await puppeteer.launch({
      headless: 'new',
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-web-security',
        '--disable-features=IsolateOrigins,site-per-process',
        '--disable-site-isolation-trials'
      ]
    });

    const page = await browser.newPage();
    
    // Set a reasonable viewport
    await page.setViewport({ width: 1366, height: 768 });

    // Setup request interception
    await page.setRequestInterception(true);
    page.on('request', request => {
      const resourceType = request.resourceType();
      // Allow only essential resources
      if (['document', 'script', 'stylesheet', 'xhr', 'fetch'].includes(resourceType)) {
        request.continue();
      } else {
        request.abort();
      }
    });

    // Navigate to page with basic timeout
    await page.goto(targetUrl, { 
      waitUntil: 'domcontentloaded',
      timeout: 30000
    });

    // Modify page content to handle CSP and prepare for proxying
    await page.evaluate(() => {
      // Remove all CSP meta tags
      document.querySelectorAll('meta').forEach(meta => {
        const content = meta.getAttribute('content') || '';
        if (content.includes('frame-ancestors') || 
            content.includes('content-security-policy')) {
          meta.remove();
        }
      });

      // Convert all relative URLs to absolute
      const baseUrl = window.location.origin;
      document.querySelectorAll('link[rel="stylesheet"], script[src], img[src], a[href]').forEach(el => {
        ['src', 'href'].forEach(attr => {
          if (el[attr]) {
            try {
              if (el[attr].startsWith('//')) {
                el[attr] = 'https:' + el[attr];
              } else if (el[attr].startsWith('/')) {
                el[attr] = baseUrl + el[attr];
              } else if (!el[attr].startsWith('http')) {
                el[attr] = new URL(el[attr], baseUrl).href;
              }
            } catch (e) {}
          }
        });
      });

      // Override any frame blocking scripts
      const script = document.createElement('script');
      script.textContent = `
        if (window.top !== window.self) {
          window.top.location = window.self.location;
          window.frameElement = null;
        }
      `;
      document.head.appendChild(script);
    });

    // Get the modified content
    const content = await page.content();

    // Set headers for proper rendering
    res.setHeader('Content-Type', 'text/html; charset=UTF-8');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', '*');
    res.setHeader('X-Frame-Options', 'ALLOWALL');
    // Set a very permissive CSP
    res.setHeader('Content-Security-Policy', 
      "default-src * 'unsafe-inline' 'unsafe-eval' data: blob:; " +
      "frame-ancestors *; " +
      "img-src * data: blob: 'unsafe-inline'; " +
      "style-src * 'unsafe-inline'; " +
      "script-src * 'unsafe-inline' 'unsafe-eval'; " +
      "connect-src * 'unsafe-inline';"
    );

    // Send the modified content
    res.send(content);

  } catch (error) {
    console.error("Proxy error:", error);
    res.status(500).json({ 
      error: "Error proxying the request", 
      message: error.message 
    });
  } finally {
    if (browser) {
      await browser.close().catch(console.error);
    }
  }
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error("Server error:", err);
  res
    .status(500)
    .json({ error: "Internal server error", message: err.message });
});

app.listen(3000, () => {
  console.log("🚀 Backend running on http://localhost:3000");
});
