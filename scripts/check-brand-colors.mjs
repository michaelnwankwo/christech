import { readFile, readdir } from "node:fs/promises";
import { extname, join } from "node:path";

const roots = ["src"];
const allowed = new Set([
  "#D32F2F", "#E53935", "#940128", "#FDF2F2",
  "#000000", "#0A0A0A", "#FFFFFF", "#A1A1AA",
]);
const textExtensions = new Set([".css", ".ts", ".tsx", ".svg"]);
const violations = [];

async function walk(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) await walk(path);
    else if (textExtensions.has(extname(path))) {
      const text = await readFile(path, "utf8");
      for (const match of text.matchAll(/#[0-9a-f]{3,8}\b/gi)) {
        const raw = match[0];
        const normalized = raw.length === 4
          ? `#${[...raw.slice(1)].map((c) => c + c).join("")}`.toUpperCase()
          : raw.toUpperCase();
        if (!allowed.has(normalized)) violations.push(`${path}: ${raw}`);
      }
    }
  }
}

for (const root of roots) await walk(root);
if (violations.length) {
  console.error(`Off-palette colors found:\n${violations.join("\n")}`);
  process.exit(1);
}
console.log("Brand color check passed.");
