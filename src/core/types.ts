// ============================
// Core Type Definitions
// ============================

export interface BountyIssue {
  id: number;
  repo: string;           // "owner/repo"
  title: string;
  body: string;
  html_url: string;
  labels: string[];
  reward_estimate: number; // USD estimate
  platform: "github" | "gitcoin" | "bountysource" | "issuehunt";
  created_at: string;
  updated_at: string;
  language?: string;
  has_tests?: boolean;
  has_ci?: boolean;
  maintainer_active_days?: number;
  comments_count?: number;
  state: "open" | "closed";
}

export interface ScoredIssue extends BountyIssue {
  score: number;         // 0-100
  reward_weight: number;
  success_probability: number;
  clarity_score: number;
  time_efficiency: number;
}

export interface AnalysisResult {
  issue: ScoredIssue;
  reasoning: string;
  recommended_action: "pursue" | "skip";
  estimated_effort_hours: number;
  merge_probability: number; // 0-1
}

export interface FixResult {
  repo_path: string;
  branch_name: string;
  changes: string[];        // files changed
  commit_message: string;
  pr_description: string;
  success: boolean;
  error?: string;
}

export interface ValidationResult {
  passed: boolean;
  tests_passed: number;
  tests_failed: number;
  lint_passed: boolean;
  build_passed: boolean;
  attempts: number;
  errors: string[];
}

export interface PRResult {
  pr_url: string;
  pr_number: number;
  success: boolean;
  error?: string;
}

export interface AgentConfig {
  github_token: string;
  github_username: string;
  data_dir: string;
  max_retries: number;
  min_score_threshold: number;
  scan_interval_ms: number;
  max_concurrent_tasks: number;
  computer_use_enabled: boolean;
}

export type AgentStatus = "idle" | "scanning" | "analyzing" | "coding" | "validating" | "submitting_pr" | "error";

export interface TaskRecord {
  id: string;
  issue_id: number;
  repo: string;
  score: number;
  status: "queued" | "in_progress" | "success" | "failed";
  reward_earned: number;
  pr_url?: string;
  started_at?: string;
  completed_at?: string;
  error?: string;
}
