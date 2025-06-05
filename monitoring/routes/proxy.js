// proxy.js
import express from "express";
import fetch from "node-fetch";

const router = express.Router();

router.get("/", async (req, res) => {
  const url = req.query.url;
  if (!url || !/^https?:\/\//.test(url)) return res.status(400).send("Invalid URL");

  try {
    const resp = await fetch(url);
    let html = await resp.text();

    // Inject <base> tag so relative links work
    html = html.replace(/<head>/i, `<head><base href="${url}">`);

    res.set("Content-Type", "text/html");
    res.send(html);
  } catch (e) {
    console.error(e);
    res.status(500).send("Failed to proxy.");
  }
});

export default router;
