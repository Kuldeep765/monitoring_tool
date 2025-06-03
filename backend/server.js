import express from "express";
import cors from "cors";
import fs from "fs/promises";
import path from "path";
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
