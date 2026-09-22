#!/usr/bin/env node
// Removes em dashes (and en dashes / other long dashes) from every
// tracked text file in the repo. Each dash character becomes a plain
// hyphen, so surrounding spacing is preserved (a spaced separator
// turns into " - ").
import { execSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";

const BIN = new Set(["png", "jpg", "jpeg", "gif", "webp", "ico", "wav", "mp3", "db", "pid", "lock", "woff", "woff2", "ttf"]);
const DASHES = /[\u2010\u2011\u2012\u2013\u2014\u2015\u2E3A\u2E3B]/g;

const files = execSync("git ls-files", { encoding: "utf8", cwd: process.cwd() })
  .split("\n")
  .filter(Boolean)
  .filter((f) => !BIN.has(f.split(".").pop()?.toLowerCase() ?? ""));

let total = 0;
const touched = [];
for (const f of files) {
  let content;
  try {
    content = readFileSync(f, "utf8");
  } catch {
    continue; // unreadable/binary
  }
  if (content.includes("\u0000")) continue; // binary safety net
  const matches = content.match(DASHES);
  if (!matches || matches.length === 0) continue;
  writeFileSync(f, content.replace(DASHES, "-"));
  total += matches.length;
  touched.push(`${f}: ${matches.length}`);
}

console.log(touched.join("\n"));
console.log(`\nreplaced ${total} dash characters across ${touched.length} files`);
