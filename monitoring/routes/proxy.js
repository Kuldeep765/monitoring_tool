import express from "express";
import axios from "axios";
import mime from "mime-types";
import { HttpsProxyAgent } from "https-proxy-agent";

const router = express.Router();
const PROXY_PROVIDERS = {
  freeproxy: {
    enabled: true,
    type: "rotating",
    proxies: [
      "http://103.152.112.162:80",
      "http://103.134.177.182:8888",
      "http://194.195.240.60:8080",
      "http://45.195.77.1:8080",
      "http://103.179.139.137:8080",
      "http://41.65.236.37:1981",
      "http://103.167.71.20:80",
      "http://157.100.12.138:999",
      "http://103.216.49.233:8080",
      "http://103.145.142.100:8080",
      "http://41.65.236.35:1976",
      "http://103.167.71.32:80"
    ],
    currentIndex: 0,
    createAgent: function () {
      const proxy = this.proxies[this.currentIndex];
      this.currentIndex = (this.currentIndex + 1) % this.proxies.length;

      try {
        const url = new URL(proxy);
        return new HttpsProxyAgent({
          host: url.hostname,
          port: parseInt(url.port) || 80,
          rejectUnauthorized: false,
          timeout: 20000, // Increased timeout
          keepAlive: true
        });
      } catch (error) {
        console.error("Invalid proxy URL:", proxy);
        return null;
      }
    },
  },

  // Direct connection (no proxy) - always works as fallback
  direct: {
    enabled: true,
    type: "direct",
    createAgent: function () {
      return null; // No agent = direct connection
    },
  },
};

// ===== UTILITY FUNCTIONS =====
const ensureHttps = (url) => {
  try {
    const parsed = new URL(url);
    if (parsed.protocol === "http:") {
      parsed.protocol = "https:";
    }
    return parsed.toString();
  } catch {
    return url;
  }
};

const getRandomUserAgent = () => {
  const userAgents = [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Safari/605.1.15",
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Edge/120.0.0.0"
  ];
  return userAgents[Math.floor(Math.random() * userAgents.length)];
};

// Enhanced fetch function with better retry logic
const fetchWithProxyFallback = async (url, options = {}) => {
  const enabledProviders = Object.entries(PROXY_PROVIDERS).filter(
    ([_, config]) => config.enabled
  );
  let lastError;
  const maxRetries = 2; // Retry each provider twice

  for (const [providerName, provider] of enabledProviders) {
    for (let retry = 0; retry < maxRetries; retry++) {
      try {
        console.log(`🔄 Attempting with ${providerName} (attempt ${retry + 1})...`);

        const agent = provider.createAgent();

        const axiosConfig = {
          timeout: 30000, // Increased timeout
          maxRedirects: 5,
          validateStatus: (status) => status < 500, // Accept 4xx errors but retry on 5xx
          headers: {
            "User-Agent": getRandomUserAgent(),
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8",
            "Accept-Language": "en-US,en;q=0.9",
            "Accept-Encoding": "gzip, deflate, br",
            "Connection": "keep-alive",
            "Upgrade-Insecure-Requests": "1",
            "Cache-Control": "no-cache",
            "Pragma": "no-cache",
            "Sec-Fetch-Dest": "document",
            "Sec-Fetch-Mode": "navigate",
            "Sec-Fetch-Site": "none",
            "Sec-Fetch-User": "?1",
            ...options.headers,
          },
          ...options,
        };

        if (agent) {
          axiosConfig.httpsAgent = agent;
          axiosConfig.httpAgent = agent;
        }

        const response = await axios.get(url, axiosConfig);
        console.log(`✅ Success with ${providerName} (status: ${response.status})`);
        return response;
      } catch (error) {
        lastError = error;
        console.error(`❌ Failed with ${providerName} (attempt ${retry + 1}):`, error.message);

        if (error.response?.status === 403 || error.response?.status === 404) {
          console.log(`🚫 Not retrying ${providerName} due to ${error.response.status} error`);
          break; // Skip to next provider
        }

        // Small delay between retry attempts
        if (retry < maxRetries - 1) {
          await new Promise((resolve) => setTimeout(resolve, 1500));
        }
      }
    }

    // Delay between different providers
    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  throw lastError || new Error("All proxy providers failed");
};

// Health check route
router.get("/health", async (req, res) => {
  console.log('🏥 Running health check...');
  const results = {};
  
  for (const [providerName, provider] of Object.entries(PROXY_PROVIDERS)) {
    if (!provider.enabled) {
      results[providerName] = { status: 'disabled' };
      continue;
    }

    try {
      console.log(`Testing ${providerName}...`);
      
      const agent = provider.createAgent();
      const axiosConfig = {
        timeout: 10000,
        headers: { 'User-Agent': getRandomUserAgent() }
      };
      
      if (agent) {
        axiosConfig.httpsAgent = agent;
        axiosConfig.httpAgent = agent;
      }
      
      const response = await axios.get('https://httpbin.org/get', axiosConfig);
      results[providerName] = { 
        status: '✅ healthy',
        responseTime: response.config.metadata?.endTime - response.config.metadata?.startTime || 'unknown'
      };
    } catch (error) {
      results[providerName] = { 
        status: '❌ unhealthy', 
        error: error.message 
      };
    }
  }

  res.json({
    timestamp: new Date().toISOString(),
    providers: results,
    summary: {
      total: Object.keys(PROXY_PROVIDERS).length,
      enabled: Object.values(PROXY_PROVIDERS).filter(p => p.enabled).length,
      healthy: Object.values(results).filter(r => r.status.includes('healthy')).length
    }
  });
});

// Main proxy route
router.get("/", async (req, res) => {
  const url = req.query.url;

  if (!url || !/^https?:\/\//.test(url)) {
    return res.status(400).json({
      error: "Invalid or missing URL",
      provided: url,
      usage: "Add ?url=https://example.com to your request"
    });
  }

  const finalUrl = ensureHttps(url);
  console.log(`🔄 Proxying request to: ${finalUrl}`);

  try {
    const startTime = Date.now();
    const response = await fetchWithProxyFallback(finalUrl);
    const endTime = Date.now();

    // Set response headers
    res.set("Content-Type", response.headers['content-type'] || "text/html; charset=utf-8");
    res.set("X-Proxy-Status", "success");
    res.set("X-Response-Time", `${endTime - startTime}ms`);
    res.set("X-Final-URL", finalUrl);
    res.set("X-Original-Status", response.status);
    
    // Handle different response types
    if (response.headers['content-type']?.includes('application/json')) {
      res.json(response.data);
    } else {
      res.send(response.data);
    }
  } catch (err) {
    console.error("❌ All proxies failed:", err.message);

    // Determine error type for better user feedback
    let errorType = 'PROXY_ERROR';
    let suggestion = 'Try again later or check your network connection';

    if (err.code === 'ETIMEDOUT') {
      errorType = 'TIMEOUT';
      suggestion = 'The request timed out. The target website might be slow or blocking requests.';
    } else if (err.response?.status === 403) {
      errorType = 'BLOCKED';
      suggestion = 'The website is blocking proxy requests. Try a different URL or access method.';
    } else if (err.response?.status === 404) {
      errorType = 'NOT_FOUND';
      suggestion = 'The requested page was not found. Check the URL.';
    } else if (err.code === 'ECONNREFUSED') {
      errorType = 'CONNECTION_REFUSED';
      suggestion = 'Connection was refused. The website might be down.';
    }

    res.status(500).json({
      error: "Proxy request failed",
      errorType: errorType,
      details: {
        message: err.message,
        code: err.code,
        status: err.response?.status,
        url: finalUrl,
        timestamp: new Date().toISOString(),
        suggestion: suggestion
      }
    });
  }
});

// Asset proxy route
router.get("/*asset", async (req, res) => {
  const targetUrl = req.query.url;

  if (!targetUrl || !/^https?:\/\//.test(targetUrl)) {
    return res.status(400).json({
      error: "Invalid or missing asset URL",
      provided: targetUrl,
      usage: "Add ?url=https://example.com/image.jpg to your request"
    });
  }

  try {
    const finalUrl = ensureHttps(targetUrl);
    console.log(`🔄 Proxying asset: ${finalUrl}`);

    const response = await fetchWithProxyFallback(finalUrl, {
      responseType: "stream",
    });

    const contentType =
      response.headers["content-type"] ||
      mime.lookup(finalUrl) ||
      "application/octet-stream";

    res.set("Content-Type", contentType);
    res.set("X-Proxy-Status", "success");
    res.set("Cache-Control", "public, max-age=3600"); // Cache assets for 1 hour
    
    // Set content length if available
    if (response.headers['content-length']) {
      res.set("Content-Length", response.headers['content-length']);
    }

    response.data.pipe(res);
  } catch (err) {
    console.error("❌ Asset proxy failed:", err.message);
    res.status(500).json({
      error: "Failed to fetch asset",
      details: {
        message: err.message,
        code: err.code,
        url: targetUrl,
        timestamp: new Date().toISOString(),
      },
    });
  }
});

export default router;