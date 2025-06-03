import express from "express";
import cors from "cors";
import { captureMaster, compareScreens } from "./utils/screenshot.js";
import { saveCoords, getCoords } from "./utils/storage.js";

const app = express();
app.use(cors());
app.use(express.json());

app.post("/api/save", async (req, res) => {
  const { url, selections } = req.body;
  await saveCoords(url, selections);
  await captureMaster(url, selections);
  res.sendStatus(200);
});

app.get("/api/compare", async (req, res) => {
  const url = req.query.url;
  const selections = await getCoords(url);
  await compareScreens(url, selections);
  res.send("Comparison done.");
});

app.listen(3000, () => {
  console.log("🚀 Backend running on http://localhost:3000");
});
