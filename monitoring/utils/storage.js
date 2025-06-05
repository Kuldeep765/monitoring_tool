import fs from "fs/promises";
import path from "path";
import { mkdir, writeFile } from "fs/promises";
import { dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

export async function saveCoords(url, coords) {
  const safeName = url.replace(/[^a-z0-9]/gi, "_");
  const filePath = path.join(__dirname, "../data/master", `${safeName}.json`);
  const dir = path.dirname(filePath);

  try {
    await mkdir(dir, { recursive: true });
    await writeFile(filePath, JSON.stringify({ url, coords }, null, 2));
  } catch (err) {
    console.error("Failed to save coords:", err);
    throw err;
  }
}

export const getCoords = async (url) => {
  const safeName = url.replace(/[^a-z0-9]/gi, "_");
  const filePath = path.join(__dirname, "../data/master", `${safeName}.json`);

  try {
    const exists = await fs.stat(filePath).catch(() => false);
    if (exists) {
      const content = JSON.parse(await fs.readFile(filePath, "utf8"));
      return content.coords;
    }
    return [];
  } catch (err) {
    console.error("Error reading coords:", err);
    return [];
  }
};
