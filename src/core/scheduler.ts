import { ScoutAgent } from "../agents/scout.js";
import { AnalyzerAgent } from "../agents/analyzer.js";
import { CoderAgent } from "../agents/coder.js";
import { ValidatorAgent } from "../agents/validator.js";
import { PRAgent } from "../agents/pr-agent.js";
import { GitHubClient } from "../utils/github.js";
import { Storage } from "./storage.js";
import { AgentConfig, AnalysisResult } from "./types.js";

export class Scheduler {
  private scout: ScoutAgent;
  private analyzer: AnalyzerAgent;
  private coder: CoderAgent;
  private validator: ValidatorAgent;
  private prAgent: PRAgent;
  private storage: Storage;
  private config: AgentConfig;
  private intervalId?: ReturnType<typeof setInterval>;
  private running = false;

  constructor(config: AgentConfig) {
    this.config = config;
    const github = new GitHubClient(this.config.github_token, config.github_username);
    this.storage = new Storage(config.data_dir);
    this.scout = new ScoutAgent(github, this.storage);
    this.analyzer = new AnalyzerAgent(this.storage, config);
    this.coder = new CoderAgent(config.data_dir);
    this.validator = new ValidatorAgent();
    this.prAgent = new PRAgent(github, config);
  }

  /** Start the main loop */
  start(): void {
    if (this.running) return;
    this.running = true;

    console.log(`[Scheduler] Starting bounty agent (interval: ${this.config.scan_interval_ms}ms)`);

    // Run immediately, then on interval
    this.mainLoop();
    this.intervalId = setInterval(() => this.mainLoop(), this.config.scan_interval_ms);
  }

  /** Stop the scheduler */
  stop(): void {
    this.running = false;
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = undefined;
    }
    this.storage.close();
    console.log("[Scheduler] Stopped");
  }

  /** Single execution cycle */
  private async mainLoop(): Promise<void> {
    try {
      console.log("[Scheduler] === Scan cycle started ===");

      // 1. Scout: find new issues
      console.log("[Scout] Scanning for issues...");
      const newIssues = await this.scout.scan();
      console.log(`[Scout] Found ${newIssues.length} new issues`);

      if (newIssues.length === 0) {
        console.log("[Scout] No new issues, skipping this cycle");
        return;
      }

      // 2. Analyzer: score and prioritize
      console.log("[Analyzer] Analyzing issues...");
      const analyzed = this.analyzer.analyze(newIssues);
      const best = this.analyzer.selectBest(analyzed);
      console.log(`[Analyzer] Analyzed ${analyzed.length} issues`);

      if (!best) {
        console.log("[Analyzer] No task above threshold, skipping");
        return;
      }

      console.log(`[Analyzer] Best task: ${best.issue.repo}#${best.issue.id} (score: ${best.issue.score})`);

      // 3. Process the best task through the pipeline
      await this.processTask(best);

      // 4. Show stats
      const stats = this.storage.getStats();
      console.log(`[Stats] Total: ${stats.total} | Success: ${stats.success} | Failed: ${stats.failed} | Earned: $${stats.totalReward}`);

    } catch (err: any) {
      console.error(`[Scheduler] Error in main loop: ${err.message}`);
    }
  }

  /** Process a single task through Coder -> Validator -> PR */
  private async processTask(analysis: AnalysisResult): Promise<void> {
    const issue = analysis.issue;
    const taskId = `${issue.repo.replace("/", "-")}-${issue.id}`;

    console.log(`[Pipeline] Processing ${issue.repo}#${issue.id}: "${issue.title}"`);

    // Update status
    this.storage.updateIssueStatus(issue.repo, issue.id, "in_progress");

    try {
      // 4. Coder: setup repo
      console.log("[Coder] Setting up repository...");
      const repoDir = await this.coder.setupRepo(issue.repo, `https://github.com/${issue.repo}.git`);

      // 5. Coder: develop fix
      console.log("[Coder] Developing fix...");
      const fix = await this.coder.developFix(repoDir, analysis, this.config.github_token);

      // 6. Validator: run tests
      console.log("[Validator] Running validations...");
      const validation = await this.validator.validate(repoDir, this.config.max_retries);

      if (!validation.passed) {
        console.error(`[Validator] Validation failed: ${validation.errors.join(", ")}`);
        this.storage.updateIssueStatus(issue.repo, issue.id, "failed", undefined, validation.errors.join("; "));
        return;
      }

      // 7. Commit and submit PR
      console.log("[Coder] Committing changes...");
      this.coder.commitChanges(repoDir, fix.commit_message);

      console.log("[PR Agent] Submitting Pull Request...");
      const prResult = await this.prAgent.submit(issue.repo, fix, analysis);

      if (prResult.success) {
        console.log(`[PR Agent] PR created: ${prResult.pr_url}`);
        this.storage.updateIssueStatus(issue.repo, issue.id, "success", prResult.pr_url);
      } else {
        console.error(`[PR Agent] Failed: ${prResult.error}`);
        this.storage.updateIssueStatus(issue.repo, issue.id, "failed", undefined, prResult.error);
      }

    } catch (err: any) {
      console.error(`[Pipeline] Error: ${err.message}`);
      this.storage.updateIssueStatus(issue.repo, issue.id, "failed", undefined, err.message);
    }
  }

  /** Get current stats */
  getStats() {
    return this.storage.getStats();
  }
}
