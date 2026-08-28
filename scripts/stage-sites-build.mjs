import { copyFile, mkdir } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const source = resolve(root, "dist", "habesha_nights", "index.mjs");
const outputDirectory = resolve(root, "dist", "server");

await mkdir(outputDirectory, { recursive: true });
await copyFile(source, resolve(outputDirectory, "index.js"));
