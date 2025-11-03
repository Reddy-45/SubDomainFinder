#!/usr/bin/env node
/**
 * Simple Subdomain Finder
 * 
 * Usage: node subfinder.js <domain>
 * 
 * Example: node subfinder.js google.com
 * 
 * Dependencies: npm install axios
 */

import fs from "fs";
import dns from "dns/promises";
import axios from "axios";

const args = process.argv.slice(2);
if (args.length < 1) {
  console.log("Usage: node subfinder.js <domain>");
  process.exit(1);
}

const domain = args[0].toLowerCase();
const CRT_SH_BASE = "https://crt.sh/";
const MAX_CONCURRENT = 20;

/** Fetch subdomains from crt.sh */
async function fetchSubdomains(domain) {
  try {
    const url = `${CRT_SH_BASE}?q=%25.${domain}&output=json`;
    const res = await axios.get(url, {
      timeout: 20000,
      headers: { "User-Agent": "subfinder_node/1.0" },
    });

    const subs = new Set();
    if (Array.isArray(res.data)) {
      for (const entry of res.data) {
        const names = (entry.name_value || "").split("\n");
        for (let n of names) {
          n = n.trim().replace(/^\*\./, ""); // remove wildcard
          if (n.endsWith(domain)) subs.add(n.toLowerCase());
        }
      }
    }

    return [...subs].sort();
  } catch (err) {
    console.error("[!] Failed to fetch from crt.sh:", err.message);
    return [];
  }
}

/** Resolve A + AAAA records for a hostname */
async function resolveHost(host) {
  const ips = new Set();

  // OS-level DNS resolver (reliable)
  try {
    const lookup = await dns.lookup(host, { all: true });
    for (const r of lookup) ips.add(r.address);
  } catch {}

  // DNS resolver fallback
  try {
    const a = await dns.resolve4(host);
    for (const ip of a) ips.add(ip);
  } catch {}

  try {
    const aaaa = await dns.resolve6(host);
    for (const ip of aaaa) ips.add(ip);
  } catch {}

  return [...ips];
}

/** Limit concurrency */
async function concurrencyMap(items, mapper, concurrency = 10) {
  const out = [];
  let index = 0;

  const workers = Array.from({ length: concurrency }, async () => {
    while (true) {
      const i = index++;
      if (i >= items.length) return;
      const item = items[i];
      try {
        const result = await mapper(item);
        out.push({ item, result });
      } catch (err) {
        out.push({ item, error: err });
      }
    }
  });

  await Promise.all(workers);
  return out;
}

/** Main workflow */
async function main() {
  console.log(`\n[+] Fetching subdomains for: ${domain}`);
  const subdomains = await fetchSubdomains(domain);
  console.log(`[+] Found ${subdomains.length} unique subdomains.\n`);

  if (subdomains.length === 0) {
    console.log("[!] No subdomains found.");
    return;
  }

  console.log("[+] Resolving IP addresses...\n");
  const resolved = await concurrencyMap(subdomains, resolveHost, MAX_CONCURRENT);

  let count = 0;
  for (const { item, result } of resolved.sort((a, b) => a.item.localeCompare(b.item))) {
    if (result && result.length > 0) {
      console.log(`${item}`);
      result.forEach(ip => console.log(`   └─ ${ip}`));
      count++;
    }
  }

  console.log(`\nSummary:`);
  console.log(` - Total subdomains found: ${subdomains.length}`);
  console.log(` - Successfully resolved: ${count}`);
}

main();
