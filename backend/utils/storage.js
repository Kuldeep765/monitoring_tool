import fs from "fs/promises";
import path from "path";

export const saveCoords = async (url, coords) => {
  const filename = path.join("data/master", `${Date.now()}.json`);
  await fs.writeFile(filename, JSON.stringify({ url, coords }, null, 2));
};

export const getCoords = async (url) => {
  const files = (await fs.readdir("data/master")).filter(f => f.endsWith(".json"));
  let regions = [];
  for (const file of files) {
    const contentRaw = await fs.readFile(path.join("data/master", file), "utf8");
    const content = JSON.parse(contentRaw);
    if (content.url === url) {
      regions = regions.concat(content.coords);
    }
  }
  return regions;
};
