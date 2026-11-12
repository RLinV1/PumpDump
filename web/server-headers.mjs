// behindProxy: the only peer is a proxy that sets X-Forwarded-For itself (Caddy in compose); never enable on a public port.
export function sanitizeForwardingHeaders(request, behindProxy = process.env.TRUST_PROXY_HEADERS === "true") {
  const client = behindProxy ? request.headers["x-forwarded-for"]?.split(",").at(-1).trim() : undefined;
  delete request.headers.forwarded;
  delete request.headers["x-real-ip"];
  request.headers["x-forwarded-for"] = client || request.socket.remoteAddress;
  request.headers["x-forwarded-host"] = request.headers.host ?? "";
  request.headers["x-forwarded-proto"] = request.socket.encrypted ? "https" : "http";
}

export function isApiRequest(target) {
  try {
    const url = /^https?:/i.test(target) ? new URL(target) : new URL(target, "http://localhost");
    const path = url.pathname.toLowerCase(); // Next's proxy rule is case-insensitive
    return path === "/api" || path.startsWith("/api/");
  }
  catch { return false; }
}

// Next matches /api case-insensitively, so give the door handlers (which match the exact lowercase prefix) the same view.
export function canonicalApiUrl(target) {
  return isApiRequest(target) ? target.replace(/^(https?:\/*[^/]+)?\/api(?=[/?]|$)/i, "$1/api") : target;
}

// Safe-by-default headers for every web response. No CSP script rules: Next injects inline scripts. No HSTS: the site is plain HTTP.
export function applySecurityHeaders(response) {
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  response.setHeader("Content-Security-Policy", "frame-ancestors 'none'; base-uri 'self'; object-src 'none'");
  response.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
}
