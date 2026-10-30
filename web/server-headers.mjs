export function sanitizeForwardingHeaders(request) {
  delete request.headers.forwarded;
  delete request.headers["x-real-ip"];
  request.headers["x-forwarded-for"] = request.socket.remoteAddress;
  request.headers["x-forwarded-host"] = request.headers.host ?? "";
  request.headers["x-forwarded-proto"] = request.socket.encrypted ? "https" : "http";
}

export function isApiRequest(target) {
  try {
    const url = /^https?:/i.test(target) ? new URL(target) : new URL(target, "http://localhost");
    return url.pathname === "/api" || url.pathname.startsWith("/api/");
  }
  catch { return false; }
}
