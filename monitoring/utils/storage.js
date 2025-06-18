import fs from "fs/promises";
import path from "path";
import { mkdir, writeFile } from "fs/promises";
import { dirname } from "path";
import { fileURLToPath } from "url";
import { getBaseDir } from "./screenshot.js"; // externalize baseDir logic here

const __dirname = dirname(fileURLToPath(import.meta.url));

// utils/storage.js
export async function saveCoords(url, regionData) {
  const safeName = url.replace(/[^a-z0-9]/gi, "_");
  const baseDir = getBaseDir();
  const filePath = path.join(__dirname, "..", baseDir, `${safeName}.json`);
  const dir = path.dirname(filePath);

  try {
    await mkdir(dir, { recursive: true });

    // Create a JSON object with uuid as key
    const objectMap = {};
    for (const item of regionData) {
      objectMap[item.id] = {
        coords: item.coords,
        imageurl: item.imageurl,
      };
    }

    await writeFile(
      filePath,
      JSON.stringify({ url, regions: objectMap }, null, 2)
    );
  } catch (err) {
    console.error("Failed to save region data:", err);
    throw err;
  }
}

export const getCoords = async (url) => {
  const safeName = url.replace(/[^a-z0-9]/gi, "_");
  const baseDir = getBaseDir();
  const filePath = path.join(__dirname, "..", baseDir, `${safeName}.json`);

  try {
    const exists = await fs.stat(filePath).catch(() => false);
    if (exists) {
      const content = JSON.parse(await fs.readFile(filePath, "utf8"));
      return content.regions || {}; // return the regions object
    }
    return [];
  } catch (err) {
    console.error("Error reading coords:", err);
    return [];
  }
};