import express from "express";
import fetch from "node-fetch";
import mime from "mime-types";
 
const router = express.Router();
 
// Proxy main HTML page, URL passed via query param (?url=...)
router.get("/", async (req, res) => {
  const url = req.query.url;
  if (!url || !/^https?:\/\//.test(url)) {
    return res.status(400).send("Invalid URL");
  }
 
  try {
    const response = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
        Accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
      },
    });
 
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
 
    let html = await response.text();
    const urlObj = new URL(url);
    const baseUrl = `${urlObj.protocol}//${urlObj.host}`;
 
    // Remove existing base tags and add new base tag
    html = html.replace(/<base[^>]*>/gi, "");
    html = html.replace(/<head>/i, `<head><base href="${baseUrl}/">`);
 
    // Rewrite asset URLs to proxy them via /proxy/asset?url=...
    html = html.replace(
      /((?:src|href|action|data-[^=]*)\s*=\s*["'])\/([^"']*)(["'])/g,
      (_, prefix, path, suffix) =>
        `${prefix}/proxy/asset?url=${encodeURIComponent(
          baseUrl + "/" + path
        )}${suffix}`
    );
    // Rewrite src/href URLs to go through your /proxy route
    html = html.replace(/(src|href)=["']([^"']+)["']/g, (match, attr, link) => {
      if (link.startsWith("http") || link.startsWith("//")) {
        // absolute URLs - rewrite to proxy
        let absoluteLink = link.startsWith("//") ? "https:" + link : link;
        return `${attr}="/proxy?url=${encodeURIComponent(absoluteLink)}"`;
      }
      // relative URLs - leave alone since <base> tag is present
      return match;
    });
 
    // Similarly fix CSS url(), fetch() calls, srcset attributes, etc.
    // (As in your original proxy.js code)
 
    res.set({
      "Content-Type": "text/html; charset=utf-8",
      "X-Frame-Options": "SAMEORIGIN",
      "Access-Control-Allow-Origin": "*",
    });
 
    res.send(html);
  } catch (error) {
    console.error("Proxy error:", error);
    res.status(500).send(`Failed to proxy: ${error.message}`);
  }
});
 
// Proxy asset files like images, fonts, scripts via ?url=...
router.get("/asset", async (req, res) => {
  const targetUrl = req.query.url;
  if (!targetUrl || !/^https?:\/\//.test(targetUrl)) {
    return res.status(400).send("Invalid or missing asset URL");
  }
 
  try {
    const assetResponse = await fetch(targetUrl);
    if (!assetResponse.ok) throw new Error(`HTTP ${assetResponse.status}`);
 
    const contentType =
      assetResponse.headers.get("content-type") || "application/octet-stream";
    res.set("Content-Type", contentType);
    assetResponse.body.pipe(res);
  } catch (err) {
    console.error("Asset proxy error:", err);
    res.status(500).send("Failed to fetch asset");
  }
});
 
export default router;
 
 