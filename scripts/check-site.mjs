// Verificación rápida del sitio (sin dependencias). Uso: node scripts/check-site.mjs
// Revisa que cada enlace/recurso interno exista y que cada #ancla apunte a un id real.
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { execSync } from "node:child_process";

const pages = readdirSync(".").filter((f) => f.endsWith(".html"));
const ids = Object.fromEntries(pages.map((p) => [p, new Set([...readFileSync(p, "utf8").matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]))]));
let errors = 0;
const fail = (msg) => { errors++; console.error("✗ " + msg); };

for (const page of pages) {
  const html = readFileSync(page, "utf8");
  for (const [, url] of html.matchAll(/(?:href|src)="([^"]+)"/g)) {
    if (/^(https?:|mailto:|tel:|data:|\/\/)/.test(url) || url === "#") continue;
    const [pathQ, hash] = url.split("#");
    const path = pathQ.split("?")[0].replace(/^\//, "");
    const target = path || page;
    if (path && !existsSync(path)) fail(`${page}: no existe "${path}"`);
    else if (hash && target.endsWith(".html") && !ids[target]?.has(hash)) fail(`${page}: ancla "#${hash}" no existe en ${target}`);
  }
  if (!/<title>[^<]{10,}<\/title>/.test(html)) fail(`${page}: falta <title>`);
  if (!/name="description"/.test(html)) fail(`${page}: falta meta description`);
}
for (const js of ["main.js", "lib/manifest.js", "lib/boot.js", "functions/api/contact.js"]) {
  try { execSync(`node --check ${js}`, { stdio: "pipe" }); } catch (e) { fail(`${js}: error de sintaxis\n${e.stderr}`); }
}
console.log(errors ? `\n${errors} problema(s) encontrado(s).` : `✓ ${pages.length} páginas revisadas: enlaces, anclas y JavaScript OK.`);
process.exit(errors ? 1 : 0);
