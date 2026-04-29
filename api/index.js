export const config = { runtime: "edge" };

const TARGET_BASE = (process.env.TARGET_DOMAIN || "").replace(/\/$/, "");

const STRIP_HEADERS = new Set([
  "host",
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
  "forwarded",
  "x-forwarded-host",
  "x-forwarded-proto",
  "x-forwarded-port",
]);

export default async function handler(req) {
  // 1. استتار خطای پیکربندی (نمایش ۴۰۴ به جای خطای صریح)
  if (!TARGET_BASE) {
    return new Response("404 Not Found", { status: 404 });
  }

  try {
    const pathStart = req.url.indexOf("/", 8);
    const uriPath = pathStart === -1 ? "/" : req.url.slice(pathStart);

    // 2. صفحه استتار (Camouflage) برای ربات‌های ورسل یا مرورگرهای عادی
    if (
      req.method === "GET" &&
      (uriPath === "/" || uriPath === "/favicon.ico")
    ) {
      return new Response(
        "<!DOCTYPE html><html><head><title>Welcome</title></head><body><h1>Service is running...</h1></body></html>",
        { status: 200, headers: { "content-type": "text/html" } },
      );
    }

    // 3. حفاظت مسیر (SECRET_PATH): در صورت تنظیم متغیر محیطی، فقط ترافیک آن مسیر عبور کند
    const secretPath = process.env.SECRET_PATH;
    if (secretPath && !uriPath.startsWith(secretPath)) {
      return new Response("404 Not Found", { status: 404 });
    }

    const targetUrl = TARGET_BASE + uriPath;

    const out = new Headers();
    let clientIp = null;
    for (const [k, v] of req.headers) {
      if (STRIP_HEADERS.has(k)) continue;
      if (k.startsWith("x-vercel-")) continue;
      if (k === "x-real-ip") {
        clientIp = v;
        continue;
      }
      if (k === "x-forwarded-for") {
        if (!clientIp) clientIp = v;
        continue;
      }
      out.set(k, v);
    }
    if (clientIp) out.set("x-forwarded-for", clientIp);

    const method = req.method;
    const hasBody = method !== "GET" && method !== "HEAD";

    return await fetch(targetUrl, {
      method,
      headers: out,
      body: hasBody ? req.body : undefined,
      duplex: "half",
      redirect: "manual",
    });
  } catch (err) {
    // 4. حذف اثر انگشت خطا: پیام خطای صریح جایگزین 404 می‌شود تا شبیه وی‌پی‌ان نباشد
    return new Response("404 Not Found", { status: 404 });
  }
}
