import express from "express";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";
import { captureMaster, compareScreens } from "./utils/screenshot.js";
import { saveCoords, getCoords } from "./utils/storage.js";

const app = express();
const __dirname = path.dirname(fileURLToPath(import.meta.url));

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, "public")));

app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

// Homepage to enter URL
app.get("/", (req, res) => {
  res.render("index"); // no need for "./views/index.ejs"
});

// Preview page with URL inside iframe
app.post("/preview", (req, res) => {
  const { url } = req.body;
  res.render("preview", { url });
});

// Save selected coords and capture screenshots
app.post("/api/save", async (req, res) => {
  const { url, selections } = req.body;
  await saveCoords(url, selections);
  await captureMaster(url, selections);
  res.sendStatus(200);
});

// Compare and show diff results
app.get("/compare", async (req, res) => {
  const url = req.query.url;
  const selections = await getCoords(url);
  await compareScreens(url, selections);

  const diffFiles = (await fs.promises.readdir("data/diffs")).filter((f) =>
    f.endsWith(".png")
  );
  res.render("result", { files: diffFiles });
});

app.listen(3000, () => {
  console.log("🚀 Backend running on http://localhost:3000");
});
