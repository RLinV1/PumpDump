// behindProxy: the only peer is a proxy that sets X-Forwarded-For itself (Caddy in compose); never enable on a public port.
export function sanitizeForwardingHeaders(request, behindProxy = process.env.TRUST_PROXY_HEADERS === "true") {
  const client = behindProxy ? request.headers["x-forwarded-for"]?.split(",").at(-1).trim() : undefined;
  delete request.headers.forwarded;
  delete request.headers["x-real-ip"];
  request.headers["x-forwarded-for"] = client || request.socket.remoteAddress;
  request.headers["x-forwarded-host"] = request.headers.host ?? "";
  request.headers["x-forwarded-proto"] = request.socket.encrypted ? "https" : "http";
}

// Origin-form targets keep leading slashes as the path (Node passes "//api/x" through untouched), so collapse them before URL parsing.
const collapse = (target) => (target.startsWith("/") ? target.replace(/^\/+/, "/") : target);

export function isApiRequest(target) {
  try {
    target = collapse(target);
    const url = /^https?:/i.test(target) ? new URL(target) : new URL(target, "http://localhost");
    let path = url.pathname;
    try { path = decodeURIComponent(path); } catch { /* undecodable: compare the raw path */ }
    path = path.toLowerCase(); // Next's proxy rule is case-insensitive and may decode first
    return path === "/api" || path.startsWith("/api/");
  }
  catch { return false; }
}

// Next matches /api case-insensitively, so give the door handlers (which match the exact lowercase prefix) the same view.
export function canonicalApiUrl(target) {
  if (!isApiRequest(target)) return target;
  target = collapse(target);
  return target.replace(/^(https?:\/*[^/]+)?\/((?:%[0-9a-f]{2}|[^/?#%]){3})(?=[/?#]|$)/i, (all, origin = "", seg) => {
    let name; try { name = decodeURIComponent(seg).toLowerCase(); } catch { return all; }
    return name === "api" ? `${origin}/api` : all;
  });
}

// Safe-by-default headers for every web response. No CSP script rules: Next injects inline scripts. No HSTS: the site is plain HTTP.
export function applySecurityHeaders(response) {
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  response.setHeader("Content-Security-Policy", "frame-ancestors 'none'; base-uri 'self'; object-src 'none'");
  response.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
}
