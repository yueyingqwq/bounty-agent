import { AgentConfig } from "./types.js";
import { readFileSync, existsSync } from "fs";
import { homedir } from "os";
import { join } from "path";

export function loadConfig(): AgentConfig {
  const configPath = join(process.cwd(), "config.json");
  const userConfig = existsSync(configPath)
    ? JSON.parse(readFileSync(configPath, "utf-8"))
    : {};

  return {
    github_token: userConfig.github_token || process.env.GITHUB_TOKEN || "",
    github_username: userConfig.github_username || process.env.GITHUB_USERNAME || "",
    data_dir: userConfig.data_dir || join(homedir(), ".bounty-agent"),
    max_retries: userConfig.max_retries ?? 3,
    min_score_threshold: userConfig.min_score_threshold ?? 70,
    scan_interval_ms: userConfig.scan_interval_ms ?? 600_000,
    max_concurrent_tasks: userConfig.max_concurrent_tasks ?? 3,
    computer_use_enabled: userConfig.computer_use_enabled ?? false,
  };
}
