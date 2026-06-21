#!/usr/bin/env node
import { loadConfig } from "./core/config.js";
import { Scheduler } from "./core/scheduler.js";
import { readFileSync, existsSync, writeFileSync } from "fs";
import { join } from "path";

const config = loadConfig();

// Validate config
if (!config.github_token) {
  console.error("❌ GITHUB_TOKEN not set!");
  console.log("");
  console.log("  Setup:");
  console.log("  1. Create a GitHub Personal Access Token:");
  console.log("     https://github.com/settings/tokens/new");
  console.log("  2. Set it via:");
  console.log('     $env:GITHUB_TOKEN="ghp_your_token_here"');
  console.log('     $env:GITHUB_USERNAME="your_github_username"');
  console.log("  3. Or create a config.json:");
  console.log('     { "github_token": "...", "github_username": "..." }');
  console.log("");
  process.exit(1);
}

const scheduler = new Scheduler(config);

// Graceful shutdown
process.on("SIGINT", () => {
  console.log("\n[Agent] Shutting down...");
  scheduler.stop();
  process.exit(0);
});

process.on("SIGTERM", () => {
  scheduler.stop();
  process.exit(0);
});

console.log(`
╔════════════════════════════════════════╗
║   🤖 Bounty Agent System v1.0         ║
║   Autonomous GitHub Issue Hunter       ║
╚════════════════════════════════════════╝

Config:
  • GitHub: @${config.github_username}
  • Min Score: ${config.min_score_threshold}
  • Max Retries: ${config.max_retries}
  • Scan Interval: ${config.scan_interval_ms / 1000}s
  • Data Dir: ${config.data_dir}
  • Computer Use: ${config.computer_use_enabled ? "✅ Enabled" : "❌ Disabled"}

Starting main loop... Press Ctrl+C to stop.
`);

scheduler.start();
