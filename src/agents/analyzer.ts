import { BountyIssue, AnalysisResult, ScoredIssue, AgentConfig } from "../core/types.js";
import { scoreIssue } from "../utils/scoring.js";
import { Storage } from "../core/storage.js";

export class AnalyzerAgent {
  private storage: Storage;
  private config: AgentConfig;
  public status: "idle" | "analyzing" = "idle";

  constructor(storage: Storage, config: AgentConfig) {
    this.storage = storage;
    this.config = config;
  }

  /** Analyze and score discovered issues, return only the best candidates */
  analyze(issues: BountyIssue[]): AnalysisResult[] {
    this.status = "analyzing";

    const results: AnalysisResult[] = [];

    for (const issue of issues) {
      const scored = scoreIssue(issue) as ScoredIssue & { reasoning: string };

      const analysis: AnalysisResult = {
        issue: scored,
        reasoning: scored.reasoning,
        recommended_action: scored.score >= this.config.min_score_threshold ? "pursue" : "skip",
        estimated_effort_hours: this.estimateEffort(scored),
        merge_probability: scored.success_probability / 100,
      };

      // Save to storage
      this.storage.saveIssue({
        id: `${issue.repo.replace("/", "-")}-${issue.id}`,
        issue_id: issue.id,
        repo: issue.repo,
        score: scored.score,
        status: analysis.recommended_action === "pursue" ? "queued" : "failed",
        reward_earned: 0,
        error: analysis.recommended_action === "skip" ? "Below score threshold" : undefined,
      });

      results.push(analysis);
    }

    this.status = "idle";
    return results;
  }

  /** Pick the single best task from all analyzed results */
  selectBest(results: AnalysisResult[]): AnalysisResult | null {
    const pursuable = results.filter((r) => r.recommended_action === "pursue");
    if (pursuable.length === 0) return null;

    // Sort by score descending, then by merge probability
    pursuable.sort((a, b) => {
      const scoreDiff = b.issue.score - a.issue.score;
      if (scoreDiff !== 0) return scoreDiff;
      return b.merge_probability - a.merge_probability;
    });

    return pursuable[0];
  }

  private estimateEffort(issue: ScoredIssue): number {
    if (issue.labels.includes("documentation")) return 1;
    if (issue.labels.includes("bug")) return 2;
    if (issue.labels.includes("good first issue")) return 1.5;
    if (issue.labels.includes("enhancement")) return 4;
    return 3; // default
  }
}
