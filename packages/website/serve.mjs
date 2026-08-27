// Licensed under the Apache License Version 2.0 that can be found in the
// LICENSE file in the root directory of this source tree.
//
// Zero-dependency dev server for the landing page (Node's built-in http).
// The page is plain static HTML — no build step; this only saves you from
// opening file:// (and gets correct relative URLs).
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL(".", import.meta.url));
const port = Number(process.env.PORT ?? 8741);

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
};

createServer(async (req, res) => {
  try {
    // Contained to this directory (no ../ traversal out of the package).
    const urlPath = decodeURIComponent(new URL(req.url, "http://x").pathname);
    const filePath = normalize(join(root, urlPath === "/" ? "index.html" : urlPath));
    if (!filePath.startsWith(root)) throw new Error("forbidden");
    const body = await readFile(filePath);
    res.writeHead(200, { "content-type": MIME[extname(filePath)] ?? "application/octet-stream" });
    res.end(body);
  } catch {
    res.writeHead(404, { "content-type": "text/plain" });
    res.end("404");
  }
}).listen(port, () => {
  console.log(`[website] http://localhost:${port}`);
});
