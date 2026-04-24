import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

const outDir = new URL("../public/assets/images/", import.meta.url);
mkdirSync(outDir, { recursive: true });

const assets = [
  ["italian-chef-happy", "#f15a45", "#fff4e6", "#1d3557", "hat"],
  ["italian-chef-angry", "#b91c1c", "#ffe8d6", "#2b2d42", "hat"],
  ["japanese-chef-happy", "#2a9d8f", "#f7f7f7", "#12355b", "band"],
  ["japanese-chef-angry", "#8d0801", "#fff1f2", "#111827", "band"],
  ["mall-guard", "#007b7a", "#edf6f9", "#293241", "cap"],
  ["angry-sergeant", "#4d7c0f", "#ecfccb", "#1f2937", "beret"],
  ["stern-teacher", "#6d28d9", "#f5f3ff", "#312e81", "glasses"],
  ["airport-staff", "#2563eb", "#eff6ff", "#172554", "scarf"],
  ["hotel-concierge", "#d97706", "#fff7ed", "#431407", "suit"],
  ["local-neutral", "#475569", "#f8fafc", "#0f172a", "neutral"],
];

const size = 640;
const tempDir = join(tmpdir(), `grabmaps-assets-${Date.now()}`);
mkdirSync(tempDir, { recursive: true });

for (const [name, accent, background, ink, detail] of assets) {
  const ppmPath = join(tempDir, `${name}.ppm`);
  const webpPath = new URL(`${name}.webp`, outDir);
  writeFileSync(ppmPath, makePpm({ accent, background, ink, detail }));
  execFileSync("cwebp", ["-quiet", "-q", "88", ppmPath, "-o", webpPath.pathname]);
}

function makePpm(spec) {
  const pixels = [];
  const bg = hex(spec.background);
  const accent = hex(spec.accent);
  const ink = hex(spec.ink);
  const skin = hex("#f2c7a5");
  const blush = hex("#ef7f72");
  const white = hex("#ffffff");
  const dark = hex("#1f2937");

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      let color = bg;
      const dx = x - 320;
      const dy = y - 330;
      const head = ellipse(dx, dy, 135, 160);
      const body = roundedRect(x, y, 150, 430, 340, 180, 56);

      if (circle(x, y, 160, 155, 180) || circle(x, y, 500, 520, 260)) color = mix(bg, accent, 0.14);
      if (body) color = accent;
      if (head) color = skin;
      if (ellipse(x - 255, y - 340, 30, 54) || ellipse(x - 385, y - 340, 30, 54)) color = skin;
      if (ellipse(x - 320, y - 245, 120, 70)) color = ink;
      if (ellipse(x - 275, y - 350, 16, 21) || ellipse(x - 365, y - 350, 16, 21)) color = dark;
      if (ellipse(x - 275, y - 390, 46, 12) || ellipse(x - 365, y - 390, 46, 12)) color = ink;
      if (ellipse(x - 240, y - 370, 25, 18) || ellipse(x - 400, y - 370, 25, 18)) color = blush;
      if (roundedRect(x, y, 285, 385, 70, 20, 10)) color = spec.detail.includes("angry") ? ink : blush;

      if (spec.detail === "hat" && (roundedRect(x, y, 210, 150, 220, 65, 32) || ellipse(x - 320, y - 145, 70, 50))) color = white;
      if (spec.detail === "band" && roundedRect(x, y, 205, 205, 230, 38, 18)) color = white;
      if (spec.detail === "cap" && (roundedRect(x, y, 210, 185, 220, 60, 20) || roundedRect(x, y, 300, 230, 160, 28, 14))) color = ink;
      if (spec.detail === "beret" && ellipse(x - 290, y - 190, 125, 55)) color = ink;
      if (spec.detail === "glasses" && (ellipse(x - 275, y - 350, 42, 32) || ellipse(x - 365, y - 350, 42, 32) || roundedRect(x, y, 306, 348, 28, 8, 3))) color = mix(ink, white, 0.2);
      if (spec.detail === "scarf" && (roundedRect(x, y, 250, 432, 140, 34, 18) || roundedRect(x, y, 330, 430, 38, 110, 18))) color = white;
      if (spec.detail === "suit" && (roundedRect(x, y, 260, 440, 120, 90, 16) || roundedRect(x, y, 285, 455, 70, 150, 18))) color = ink;

      pixels.push(color[0], color[1], color[2]);
    }
  }

  return Buffer.concat([
    Buffer.from(`P6\n${size} ${size}\n255\n`, "ascii"),
    Buffer.from(pixels),
  ]);
}

function hex(value) {
  return [1, 3, 5].map((start) => Number.parseInt(value.slice(start, start + 2), 16));
}

function mix(a, b, amount) {
  return a.map((channel, index) => Math.round(channel * (1 - amount) + b[index] * amount));
}

function ellipse(dx, dy, rx, ry) {
  return (dx * dx) / (rx * rx) + (dy * dy) / (ry * ry) <= 1;
}

function circle(x, y, cx, cy, r) {
  const dx = x - cx;
  const dy = y - cy;
  return dx * dx + dy * dy <= r * r;
}

function roundedRect(x, y, left, top, width, height, radius) {
  const right = left + width;
  const bottom = top + height;
  const cx = Math.max(left + radius, Math.min(x, right - radius));
  const cy = Math.max(top + radius, Math.min(y, bottom - radius));
  const dx = x - cx;
  const dy = y - cy;
  return x >= left && x <= right && y >= top && y <= bottom && dx * dx + dy * dy <= radius * radius;
}
