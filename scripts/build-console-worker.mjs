import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const sourcePath = resolve(root, "worker/index.mjs");
const outputPath = resolve(root, "dist/cloudflare-console-worker.mjs");
const assetPaths = [
  "/index.html",
  "/styles.css",
  "/app.js",
  "/admin/index.html",
  "/admin/admin.css",
  "/admin/admin.js"
];
const contentTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8"
};

const embeddedAssets = {};
for (const assetPath of assetPaths) {
  const extension = assetPath.slice(assetPath.lastIndexOf("."));
  const contents = await readFile(resolve(root, `public${assetPath}`));
  embeddedAssets[assetPath] = {
    body: contents.toString("base64"),
    contentType: contentTypes[extension]
  };
}

let source = await readFile(sourcePath, "utf8");
const anchor = "const FALLBACK_ASSET_ORIGIN =";
const anchorIndex = source.indexOf(anchor);
const anchorEnd = source.indexOf("\n", anchorIndex);
if (anchorIndex < 0 || anchorEnd < 0) throw new Error("Worker asset anchor was not found.");

source = `${source.slice(0, anchorEnd + 1)}const EMBEDDED_ASSETS = ${JSON.stringify(embeddedAssets)};\n${source.slice(anchorEnd + 1)}`;
source = source.replace(
  "    if (env.ASSETS) return env.ASSETS.fetch(new Request(new URL(pathname, url), request));",
  `    if (env.ASSETS) return env.ASSETS.fetch(new Request(new URL(pathname, url), request));
    const embedded = EMBEDDED_ASSETS[pathname];
    if (embedded) {
      const binary = atob(embedded.body);
      const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
      return new Response(bytes, { headers: { "content-type": embedded.contentType, "cache-control": "public, max-age=300" } });
    }`
);

await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, source);
console.log(`Built ${outputPath}`);
