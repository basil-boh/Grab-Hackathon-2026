import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

let localEnv: Record<string, string> | null = null;

export function getServerEnv(name: string) {
  if (!process.env.VERCEL) {
    const value = readLocalEnv()[name];
    if (value) return value;
  }

  return process.env[name];
}

function readLocalEnv() {
  if (localEnv) return localEnv;

  localEnv = {};
  const envPath = resolve(process.cwd(), ".env");
  if (!existsSync(envPath)) return localEnv;

  const lines = readFileSync(envPath, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const equalsIndex = trimmed.indexOf("=");
    if (equalsIndex === -1) continue;

    const key = trimmed.slice(0, equalsIndex).trim();
    let value = trimmed.slice(equalsIndex + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    localEnv[key] = value;
  }

  return localEnv;
}
