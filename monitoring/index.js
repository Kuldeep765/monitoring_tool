import express from "express";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";
import { saveCoords } from "./utils/storage.js";
import { captureMaster } from "./utils/screenshot.js";
import proxyRoute from "./routes/proxy.js";

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

// app.get("/proxy", async (req, res) => {
//   const { url } = req.query;

//   if (!url || !url.startsWith("http")) {
//     return res.status(400).send("Invalid or missing URL");
//   }

//   try {
//     const response = await axios.get(url, {
//       responseType: "stream",
//       headers: {
//         // Optional: mimic a browser to reduce blocks
//         "User-Agent":
//           "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/90.0.4430.93 Safari/537.36",
//       },
//     });

//     res.setHeader("Content-Type", response.headers["content-type"] || "text/html");

//     // Optional: clear security headers
//     res.removeHeader("X-Frame-Options");
//     res.removeHeader("Content-Security-Policy");

//     response.data.pipe(res);
//   } catch (err) {
//     console.error("Proxy Error:", err.message);
//     res.status(500).send("Failed to load the URL.");
//   }
// });

app.post("/api/save", async (req, res) => {
  const { url, selections } = req.body;

  if (!selections || selections.length === 0) {
    return res.status(400).send("No selections provided");
  }

  try {
    await saveCoords(url, selections);
    await captureMaster(url, selections);
    res.sendStatus(200);
  } catch (err) {
    console.error(err);
    res.status(500).send("Failed to save or capture screenshots");
  }
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
