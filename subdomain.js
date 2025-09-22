#!/usr/bin/env node

// domain.js - Dynamic Subdomain Finder with IP resolution (ESM)

import fs from "fs";
import dns from "dns/promises";
import { spawnSync } from "child_process";
import readline from "readline";

// -------------------------------
// Auto-install helper (ESM)
// -------------------------------
async function ensureModule(name) {
  try {
    return await import(name);
  } catch {
    console.log(`[i] Installing missing package: ${name}...`);
    const res = spawnSync("npm", ["install", name], { stdio: "inherit", shell: true });
    if (res.error) {
      console.error(`[!] Failed to install ${name}:`, res.error.message);
      process.exit(1);
    }
    return await import(name);
  }
}

const axios = (await ensureModule("axios")).default;
const Papa = (await ensureModule("papaparse")).default;

// -------------------------------
// Ask domain interactively
// -------------------------------
async function askDomain() {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question("Enter target domain (e.g., microsoft.com): ", (answer) => {
      rl.close();
      resolve(answer.trim() || "example.com");
    });
  });
}

// -------------------------------
// Fetch subdomains from crt.sh
// -------------------------------
async function fetchSubdomains(domain) {
  console.log(`[i] Fetching subdomains for ${domain} from crt.sh...`);
  try {
    const url = `https://crt.sh/?q=%25.${domain}&output=json`;
    const res = await axios.get(url, { timeout: 20000 });
    let subs = new Set();
    for (let row of res.data) {
      const parts = row.name_value.split("\n");
      for (let sub of parts) {
        sub = sub.trim().toLowerCase();
        if (sub && sub.endsWith(domain)) subs.add(sub);
      }
    }
    return Array.from(subs);
  } catch (err) {
    console.error("[!] Error fetching crt.sh:", err.message);
    return [];
  }
}

// -------------------------------
// Resolve subdomains to IPs
// -------------------------------
async function resolveSubdomains(subdomains) {
  let liveMap = new Map();
  for (let sub of subdomains) {
    try {
      const ips = await dns.resolve4(sub);
      liveMap.set(sub, ips);
      console.log(`[+] ${sub} → ${ips.join(", ")}`);
    } catch {
      // skip unresolved
    }
  }
  return liveMap;
}

// -------------------------------
// Save results
// -------------------------------
function writeJSON(filename, map) {
  const obj = {};
  for (let [host, ips] of map.entries()) obj[host] = ips;
  fs.writeFileSync(filename, JSON.stringify(obj, null, 2));
  console.log(`[i] Saved ${filename}`);
}

function writeCSV(filename, map) {
  const rows = [];
  for (let [host, ips] of map.entries()) {
    for (let ip of ips) rows.push({ subdomain: host, ip });
  }
  const csv = Papa.unparse(rows);
  fs.writeFileSync(filename, csv);
  console.log(`[i] Saved ${filename}`);
}

// -------------------------------
// Main
// -------------------------------
(async () => {
  console.log("=== Dynamic Subdomain Finder ===");
  const domain = await askDomain();

  const subs = await fetchSubdomains(domain);
  console.log(`[i] Found ${subs.length} raw subdomains, resolving...`);

  const liveMap = await resolveSubdomains(subs);

  console.log(`\n[i] Final resolved: ${liveMap.size} hostnames`);
  writeJSON("results.json", liveMap);
  writeCSV("results.csv", liveMap);

  console.log("✅ Done.");
})();
