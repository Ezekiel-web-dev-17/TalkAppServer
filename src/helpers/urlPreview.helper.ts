import dns from "node:dns/promises";
import net from "node:net";
import logger from "../lib/logger.js";

export interface ILinkPreview {
  url: string;
  title?: string;
  description?: string;
  imageUrl?: string;
  siteName?: string;
  favIcon?: string;
}

// Regex to capture HTTPS URLs from text (only HTTPS to avoid weak/insecure HTTP endpoints)
const URL_REGEX = /https:\/\/[^\s<>"'{}|\\^`[\]]+/gi;

// Maximum byte size of HTML content to fetch for preview (512 KB)
const MAX_PREVIEW_HTML_BYTES = 512 * 1024;
// Maximum time allowed for preview fetching in milliseconds
const FETCH_TIMEOUT_MS = 3500;

/**
 * Check if an IP address belongs to private, loopback, link-local, or reserved ranges.
 */
export function isPrivateOrReservedIP(ip: string): boolean {
  // IPv4 checks
  if (net.isIPv4(ip)) {
    const parts = ip.split(".").map(Number);
    const [b0, b1] = parts;

    // 0.0.0.0/8 (Current network)
    if (b0 === 0) return true;
    // 10.0.0.0/8 (Private)
    if (b0 === 10) return true;
    // 127.0.0.0/8 (Loopback)
    if (b0 === 127) return true;
    // 169.254.0.0/16 (Link-local / Cloud metadata, e.g. AWS 169.254.169.254)
    if (b0 === 169 && b1 === 254) return true;
    // 172.16.0.0/12 (Private)
    if (b0 === 172 && b1 >= 16 && b1 <= 31) return true;
    // 192.168.0.0/16 (Private)
    if (b0 === 192 && b1 === 168) return true;
    // 100.64.0.0/10 (Carrier-grade NAT)
    if (b0 === 100 && b1 >= 64 && b1 <= 127) return true;
    // 192.0.2.0/24, 198.51.100.0/24, 203.0.113.0/24 (TEST-NET)
    if (b0 === 192 && b1 === 0 && parts[2] === 2) return true;
    if (b0 === 198 && b1 === 51 && parts[2] === 100) return true;
    if (b0 === 203 && b1 === 0 && parts[2] === 113) return true;
    // 224.0.0.0/4 (Multicast) & 240.0.0.0/4 (Reserved)
    if (b0 >= 224) return true;

    return false;
  }

  // IPv6 checks
  if (net.isIPv6(ip)) {
    const normalized = ip.toLowerCase();
    // Loopback
    if (normalized === "::1" || normalized === "::") return true;
    // IPv4-mapped IPv6 (::ffff:127.0.0.1, etc.)
    if (normalized.startsWith("::ffff:")) {
      const ipv4Part = normalized.substring(7);
      if (net.isIPv4(ipv4Part)) {
        return isPrivateOrReservedIP(ipv4Part);
      }
    }
    // Unique Local (fc00::/7)
    if (normalized.startsWith("fc") || normalized.startsWith("fd")) return true;
    // Link Local (fe80::/10)
    if (
      normalized.startsWith("fe8") ||
      normalized.startsWith("fe9") ||
      normalized.startsWith("fea") ||
      normalized.startsWith("feb")
    ) {
      return true;
    }
    // Multicast (ff00::/8)
    if (normalized.startsWith("ff")) return true;

    return false;
  }

  return true;
}

/**
 * Validate that a URL is secure, uses HTTPS, has a valid domain, and does not point to internal/reserved infrastructure.
 */
export async function isSafePreviewUrl(
  targetUrl: string,
): Promise<{ safe: boolean; parsedUrl?: URL; reason?: string }> {
  let parsed: URL;
  try {
    parsed = new URL(targetUrl);
  } catch {
    return { safe: false, reason: "Malformed URL" };
  }

  // 1. Strictly enforce HTTPS protocol (no plain http, file, ftp, javascript, etc.)
  if (parsed.protocol !== "https:") {
    return {
      safe: false,
      reason: "Insecure protocol: only HTTPS is permitted",
    };
  }

  // 2. Disallow non-standard ports (e.g. internal ports 22, 5432, 6379, 8080)
  if (parsed.port && parsed.port !== "443") {
    return { safe: false, reason: "Non-standard port rejected" };
  }

  const hostname = parsed.hostname.toLowerCase();

  // 3. Disallow raw IP addresses in hostname (must be a genuine domain name)
  if (net.isIP(hostname)) {
    return { safe: false, reason: "Raw IP address targets are disallowed" };
  }

  // 4. Disallow single-label or internal domains (e.g., 'localhost', 'internal', 'local', 'corp')
  const domainParts = hostname.split(".");
  if (domainParts.length < 2) {
    return { safe: false, reason: "Single-label / local hostnames disallowed" };
  }

  const tld = domainParts[domainParts.length - 1];
  const disallowedTlds = new Set([
    "local",
    "localhost",
    "internal",
    "lan",
    "home",
    "corp",
    "test",
    "invalid",
  ]);
  if (disallowedTlds.has(tld)) {
    return { safe: false, reason: "Reserved or internal TLD disallowed" };
  }

  // 5. DNS Resolution SSRF Check
  try {
    const addresses = await dns.lookup(hostname, { all: true });
    if (!addresses || addresses.length === 0) {
      return { safe: false, reason: "DNS resolution returned no addresses" };
    }

    for (const record of addresses) {
      if (isPrivateOrReservedIP(record.address)) {
        return {
          safe: false,
          reason: `Resolved IP ${record.address} is private or reserved`,
        };
      }
    }
  } catch (dnsErr) {
    return {
      safe: false,
      reason: `DNS resolution failed: ${(dnsErr as Error).message}`,
    };
  }

  return { safe: true, parsedUrl: parsed };
}

/**
 * Extract the first HTTPS URL from a message text string.
 */
export function extractUrls(text: string): string | null {
  if (!text || typeof text !== "string") return null;
  const matches = text.match(URL_REGEX);
  if (!matches) return null;

  // Deduplicate and trim punctuation often appended to URLs in natural chat (., !, ?, etc.)
  const cleanUrls = matches
    .map((url) => url.replace(/[.,;:!?)]+$/, ""))
    .filter((u) => u.startsWith("https://"))[0];
  return cleanUrls;
}

/**
 * Decode common HTML entities.
 */
function decodeHtmlEntities(str: string): string {
  return str
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x2F;/g, "/")
    .replace(/&#x60;/g, "`")
    .trim();
}

/**
 * Extract OpenGraph/Twitter/HTML metadata from HTML string.
 */
export function extractMetadataFromHtml(
  html: string,
  baseUrl: string,
): Partial<ILinkPreview> {
  const result: Partial<ILinkPreview> = {};

  // Extract meta tags: <meta (property|name)="key" content="value">
  const metaRegex =
    /<meta\s+[^>]*?(?:property|name)=["']([^"']+)["'][^>]*?content=["']([^"']*)["'][^>]*?>|<meta\s+[^>]*?content=["']([^"']*)["'][^>]*?(?:property|name)=["']([^"']+)["'][^>]*?>/gi;

  let match: RegExpExecArray | null;
  const metaTags: Record<string, string> = {};

  while ((match = metaRegex.exec(html)) !== null) {
    const key = (match[1] || match[4] || "").toLowerCase().trim();
    const content = match[2] || match[3] || "";
    if (key && content && !metaTags[key]) {
      metaTags[key] = decodeHtmlEntities(content);
    }
  }

  // 1. Preview Image: og:image -> twitter:image -> twitter:image:src
  const rawImage =
    metaTags["og:image"] ||
    metaTags["og:image:url"] ||
    metaTags["og:image:secure_url"] ||
    metaTags["twitter:image"] ||
    metaTags["twitter:image:src"];

  if (rawImage) {
    try {
      const resolved = new URL(rawImage, baseUrl).href;
      // Ensure resolved image is HTTPS
      if (resolved.startsWith("https://")) {
        result.imageUrl = resolved.substring(0, 2048);
      }
    } catch {
      // Ignore invalid image URL
    }
  }

  // 2. Title: og:title -> twitter:title -> <title>
  let title = metaTags["og:title"] || metaTags["twitter:title"];
  if (!title) {
    const titleTagMatch = /<title[^>]*>([^<]+)<\/title>/i.exec(html);
    if (titleTagMatch && titleTagMatch[1]) {
      title = decodeHtmlEntities(titleTagMatch[1]);
    }
  }
  if (title) {
    result.title = title.substring(0, 250);
  }

  // 3. Description: og:description -> twitter:description -> description
  const description =
    metaTags["og:description"] ||
    metaTags["twitter:description"] ||
    metaTags["description"];
  if (description) {
    result.description = description.substring(0, 500);
  }

  // 4. Site Name: og:site_name -> hostname fallback
  const siteName = metaTags["og:site_name"];
  if (siteName) {
    result.siteName = siteName.substring(0, 100);
  } else {
    try {
      result.siteName = new URL(baseUrl).hostname.replace(/^www\./, "");
    } catch {
      // Ignore
    }
  }

  // 5. Favicon: <link rel="(shortcut )?icon" href="...">
  const iconMatch =
    /<link\s+[^>]*?rel=["'](?:shortcut\s+)?icon["'][^>]*?href=["']([^"']+)["'][^>]*?>|<link\s+[^>]*?href=["']([^"']+)["'][^>]*?rel=["'](?:shortcut\s+)?icon["'][^>]*?>/i.exec(
      html,
    );
  if (iconMatch) {
    const rawIcon = iconMatch[1] || iconMatch[2];
    if (rawIcon) {
      try {
        const resolvedIcon = new URL(rawIcon, baseUrl).href;
        if (resolvedIcon.startsWith("https://")) {
          result.favIcon = resolvedIcon.substring(0, 2048);
        }
      } catch {
        // Ignore
      }
    }
  }

  return result;
}

/**
 * Fetch a webpage securely and extract its preview image and metadata.
 * Returns null if the URL is weak/insecure, unreachable, or non-HTML.
 */
export async function fetchUrlPreview(
  targetUrl: string,
): Promise<ILinkPreview | null> {
  // 1. SSRF & Security validation
  const safetyCheck = await isSafePreviewUrl(targetUrl);
  if (!safetyCheck.safe) {
    logger.debug(
      `[URL Preview] Skipped unsafe/ineligible URL: ${targetUrl} (${safetyCheck.reason})`,
    );
    return null;
  }

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    const response = await fetch(targetUrl, {
      method: "GET",
      signal: controller.signal,
      redirect: "follow",
      headers: {
        "User-Agent":
          "TalkApp-PreviewBot/1.0 (+https://talkapp.com; preview-bot)",
        Accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.1",
        "Accept-Language": "en-US,en;q=0.9",
      },
    });

    clearTimeout(timeoutId);

    // 2. Verify redirect destination is also safe HTTPS
    if (response.url && response.url !== targetUrl) {
      const redirectSafety = await isSafePreviewUrl(response.url);
      if (!redirectSafety.safe) {
        logger.warn(
          `[URL Preview] Blocked unsafe redirect from ${targetUrl} to ${response.url}`,
        );
        return null;
      }
    }

    if (!response.ok) {
      return null;
    }

    // 3. Ensure content is HTML
    const contentType = response.headers.get("content-type") || "";
    if (
      !contentType.includes("text/html") &&
      !contentType.includes("application/xhtml+xml")
    ) {
      return null;
    }

    // 4. Stream HTML up to MAX_PREVIEW_HTML_BYTES to prevent memory exhaustion / DoS
    let html = "";
    if (response.body) {
      const reader = response.body.getReader();
      const decoder = new TextDecoder("utf-8");
      let totalBytes = 0;

      while (totalBytes < MAX_PREVIEW_HTML_BYTES) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value) {
          totalBytes += value.byteLength;
          html += decoder.decode(value, { stream: true });
        }
      }
      reader.cancel();
    } else {
      const rawText = await response.text();
      html = rawText.substring(0, MAX_PREVIEW_HTML_BYTES);
    }

    // 5. Extract metadata
    const finalUrl = response.url || targetUrl;
    const metadata = extractMetadataFromHtml(html, finalUrl);

    // If neither image nor title was found, preview is useless
    if (!metadata.imageUrl && !metadata.title && !metadata.description) {
      return null;
    }

    return {
      url: finalUrl,
      title: metadata.title,
      description: metadata.description,
      imageUrl: metadata.imageUrl,
      siteName: metadata.siteName,
      favIcon: metadata.favIcon,
    };
  } catch (err) {
    logger.debug(
      `[URL Preview] Error fetching preview for ${targetUrl}: ${(err as Error).message}`,
    );
    return null;
  }
}
