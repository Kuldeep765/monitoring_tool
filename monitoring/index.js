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

app.post("/api/save", async (req, res) => {
  const { url, selections, iframeScroll } = req.body;

  if (!selections || selections.length === 0) {
    return res.status(400).send("No selections provided");
  }

  let regionData = {};
  try {
    console.log("Received selections:", selections);
    console.log("Iframe scroll position:", iframeScroll);

    if (iframeScroll && (iframeScroll.scrollX || iframeScroll.scrollY)) {
      regionData = await captureMasterWithScroll(url, selections, iframeScroll);
    } else {
      regionData = await captureMaster(url, selections);
    }
    await saveCoords(url, regionData);
    res.sendStatus(200);
  } catch (err) {
    console.error(err);
    res.status(500).send("Failed to save or capture screenshots");
  }
});

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
