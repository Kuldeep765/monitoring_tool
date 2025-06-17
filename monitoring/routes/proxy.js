import express from "express";
import fetch from "node-fetch";
import mime from "mime-types";
import http from "http";
import https from "https";
import { HttpsProxyAgent } from "https-proxy-agent";
import { URL } from "url";

const router = express.Router();

// Configuration
const CUSTOM_PROXY_URL = "http://200.239.219.137:50101";
const REQUEST_TIMEOUT = 30000;
const MAX_CONTENT_LENGTH = 50 * 1024 * 1024; // 50MB

// Proxy agents
const customProxyAgent = new HttpsProxyAgent(CUSTOM_PROXY_URL);
const httpsAgent = new https.Agent({ 
  rejectUnauthorized: false,
  timeout: REQUEST_TIMEOUT
});
const httpAgent = new http.Agent({ 
  timeout: REQUEST_TIMEOUT
});

// URL validation
function isValidUrl(url) {
  try {
    const urlObj = new URL(url);
    return /^https?:$/.test(urlObj.protocol);
  } catch {
    return false;
  }
}

// Security: Block potentially dangerous domains
function isBlockedDomain(url) {
  const blockedDomains = [
    'localhost',
    '127.0.0.1',
    '10.',
    '192.168.',
    '172.16.',
    '172.17.',
    '172.18.',
    '172.19.',
    '172.20.',
    '172.21.',
    '172.22.',
    '172.23.',
    '172.24.',
    '172.25.',
    '172.26.',
    '172.27.',
    '172.28.',
    '172.29.',
    '172.30.',
    '172.31.'
  ];
  
  try {
    const hostname = new URL(url).hostname.toLowerCase();
    return blockedDomains.some(blocked => hostname.includes(blocked));
  } catch {
    return true;
  }
}

// Proxy agent selector
function getAgent(url, proxyType = "direct") {
  try {
    const urlObj = new URL(url);
    
    if (proxyType === "custom") {
      return customProxyAgent;
    }
    
    // Return appropriate agent based on protocol
    return urlObj.protocol === "https:" ? httpsAgent : httpAgent;
  } catch (err) {
    console.warn("Invalid URL for agent detection:", url, err.message);
    return httpAgent;
  }
}

// Content type detection
function getContentType(response, url) {
  const headerContentType = response.headers.get("content-type");
  if (headerContentType) return headerContentType;
  
  const mimeType = mime.lookup(url);
  return mimeType || "application/octet-stream";
}

// HTML processing
function processHtml(html, baseUrl, proxyType) {
  // Remove existing base tags
  html = html.replace(/<base[^>]*>/gi, "");
  
  // Inject new base tag
  html = html.replace(
    /<head>/i, 
    `<head>\n  <base href="${baseUrl}/">`
  );
  
  // Rewrite relative URLs
  html = html.replace(
    /((?:src|href|action|data-[^=]*)\s*=\s*["'])(?!https?:\/\/|\/\/|data:|javascript:|mailto:|tel:)([^"']+)(["'])/gi,
    (match, prefix, path, suffix) => {
      // Handle absolute paths
      if (path.startsWith('/')) {
        return `${prefix}/proxy/asset?url=${encodeURIComponent(baseUrl + path)}&proxy=${proxyType}${suffix}`;
      }
      // Handle relative paths
      return `${prefix}/proxy/asset?url=${encodeURIComponent(baseUrl + "/" + path)}&proxy=${proxyType}${suffix}`;
    }
  );
  
  // Add security headers and webpack public path
  const injectedScript = `
    <script>
      // Set webpack public path for dynamic imports
      if (typeof window !== 'undefined') {
        window.__webpack_public_path__ = "/proxy/asset/";
      }
      
      // Prevent some forms of clickjacking
      if (window.top !== window.self) {
        console.warn('This page is being displayed in a frame');
      }
    </script>
  `;
  
  html = html.replace(/<\/head>/i, `${injectedScript}\n</head>`);
  
  // Remove tracking scripts and ads
  const adPatterns = [
    /<script[^>]+src=["'][^"']*(?:doubleclick|googletagmanager|google-analytics|facebook\.net|linkedin\.com|twitter\.com|ads)[^"']*["'][^>]*><\/script>/gi,
    /<iframe[^>]+src=["'][^"']*(?:doubleclick|googletagmanager|google-analytics|facebook\.net|linkedin\.com|twitter\.com|ads)[^"']*["'][^>]*><\/iframe>/gi,
    /<div[^>]+class=["'][^"']*(?:ad|advertisement|sponsor)[^"']*["'][^>]*>.*?<\/div>/gi,
  ];
  
  adPatterns.forEach(pattern => {
    html = html.replace(pattern, '');
  });
  
  return html;
}

// Main proxy route
router.get("/", async (req, res) => {
  const { url, proxy: proxyType = "direct" } = req.query;
  
  // Validation
  if (!url) {
    return res.status(400).json({ error: "URL parameter is required" });
  }
  
  if (!isValidUrl(url)) {
    return res.status(400).json({ error: "Invalid URL format" });
  }
  
  if (isBlockedDomain(url)) {
    return res.status(403).json({ error: "Access to this domain is not allowed" });
  }
  
  try {
    const response = await fetch(url, {
      agent: getAgent(url, proxyType),
      timeout: REQUEST_TIMEOUT,
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
        "Accept-Encoding": "gzip, deflate, br",
        "Cache-Control": "no-cache",
        "Pragma": "no-cache"
      },
    });
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    // Check content length
    const contentLength = response.headers.get('content-length');
    if (contentLength && parseInt(contentLength) > MAX_CONTENT_LENGTH) {
      throw new Error("Content too large");
    }
    
    const contentType = getContentType(response, url);
    const urlObj = new URL(url);
    const baseUrl = `${urlObj.protocol}//${urlObj.host}`;
    
    // Process HTML content
    if (contentType.includes('text/html')) {
      let html = await response.text();
      html = processHtml(html, baseUrl, proxyType);
      
      res.set({
        "Content-Type": "text/html; charset=utf-8",
        "X-Frame-Options": "SAMEORIGIN",
        "X-Content-Type-Options": "nosniff",
        "X-XSS-Protection": "1; mode=block",
        "Cache-Control": "no-cache, no-store, must-revalidate",
        "Pragma": "no-cache",
        "Expires": "0"
      });
      
      return res.send(html);
    }
    
    // For non-HTML content, stream directly
    res.set({
      "Content-Type": contentType,
      "Cache-Control": "public, max-age=3600"
    });
    
    response.body.pipe(res);
    
  } catch (error) {
    console.error("Proxy error:", {
      url,
      error: error.message,
      stack: error.stack
    });
    
    res.status(500).json({ 
      error: "Failed to proxy request",
      message: error.message 
    });
  }
});

// Asset proxy route
router.get("/asset", async (req, res) => {
  const { url: assetUrl, proxy: proxyType = "direct" } = req.query;
  
  // Validation
  if (!assetUrl) {
    return res.status(400).json({ error: "Asset URL parameter is required" });
  }
  
  if (!isValidUrl(assetUrl)) {
    return res.status(400).json({ error: "Invalid asset URL format" });
  }
  
  if (isBlockedDomain(assetUrl)) {
    return res.status(403).json({ error: "Access to this domain is not allowed" });
  }
  
  try {
    const assetResponse = await fetch(assetUrl, {
      agent: getAgent(assetUrl, proxyType),
      timeout: REQUEST_TIMEOUT,
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "*/*",
        "Accept-Encoding": "gzip, deflate, br"
      }
    });
    
    if (!assetResponse.ok) {
      return res.status(assetResponse.status).json({
        error: `Asset fetch failed: ${assetResponse.status} ${assetResponse.statusText}`
      });
    }
    
    // Check content length
    const contentLength = assetResponse.headers.get('content-length');
    if (contentLength && parseInt(contentLength) > MAX_CONTENT_LENGTH) {
      return res.status(413).json({ error: "Asset too large" });
    }
    
    const contentType = getContentType(assetResponse, assetUrl);
    
    // Set appropriate headers
    res.set({
      "Content-Type": contentType,
      "Cache-Control": "public, max-age=86400", // 24 hours for assets
      "Access-Control-Allow-Origin": "*"
    });
    
    // Stream the response
    assetResponse.body.pipe(res);
    
  } catch (error) {
    console.error("Asset proxy error:", {
      url: assetUrl,
      error: error.message
    });
    
    res.status(500).json({ 
      error: "Failed to fetch asset",
      message: error.message 
    });
  }
});

// Health check endpoint
router.get("/health", (req, res) => {
  res.json({ 
    status: "ok", 
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

export default router;