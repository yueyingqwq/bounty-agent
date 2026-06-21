import { BountyIssue, ScoredIssue } from "../core/types.js";

/**
 * Score an issue for profitability and feasibility.
 * final_score = reward_weight * 0.5 + success_probability * 0.2 + clarity_score * 0.2 + time_efficiency * 0.1
 */
export function scoreIssue(issue: BountyIssue): ScoredIssue & { reasoning: string } {
  const rewardWeight = calculateRewardWeight(issue.reward_estimate);
  const successProb = calculateSuccessProbability(issue);
  const clarity = calculateClarity(issue);
  const timeEff = calculateTimeEfficiency(issue);

  const score = Math.round(
    rewardWeight * 0.5 +
    successProb * 0.2 +
    clarity * 0.2 +
    timeEff * 0.1
  );

  const guardrails = applyGuardrails(issue);

  const reasoning = buildReasoning(rewardWeight, successProb, clarity, timeEff, score, guardrails);

  return {
    ...issue,
    score: Math.min(100, Math.max(0, score - guardrails.penalty)),
    reward_weight: rewardWeight,
    success_probability: successProb,
    clarity_score: clarity,
    time_efficiency: timeEff,
    reasoning,
  };
}

function calculateRewardWeight(estimate: number): number {
  if (estimate <= 0) return 10;
  if (estimate < 20) return 20;
  if (estimate < 50) return 40;
  if (estimate < 100) return 60;
  if (estimate < 500) return 80;
  return 95;
}

function calculateSuccessProbability(issue: BountyIssue): number {
  let prob = 50; // baseline

  if (issue.has_tests === true) prob += 15;
  if (issue.has_ci === true) prob += 10;
  if (issue.maintainer_active_days !== undefined && issue.maintainer_active_days < 7) prob += 10;
  if (issue.labels.some(l => ["good first issue", "beginner"].includes(l))) prob += 10;
  if (issue.labels.includes("bug")) prob += 5;
  if (issue.labels.includes("help wanted")) prob += 5;
  if (issue.comments_count !== undefined && issue.comments_count > 10) prob -= 10;

  return Math.min(95, Math.max(5, prob));
}

function calculateClarity(issue: BountyIssue): number {
  let clarity = 50;
  if (issue.body && issue.body.length > 100) clarity += 15;
  if (issue.body && issue.body.length > 500) clarity += 10;
  if (issue.labels.includes("bug")) clarity += 10;
  if (issue.labels.includes("feature")) clarity -= 5;
  if (issue.comments_count !== undefined && issue.comments_count > 5) clarity += 5;
  return Math.min(95, Math.max(5, clarity));
}

function calculateTimeEfficiency(issue: BountyIssue): number {
  let eff = 50;
  if (issue.labels.includes("bug")) eff += 20;
  if (issue.labels.includes("good first issue")) eff += 15;
  if (issue.labels.includes("documentation")) eff += 25;
  if (issue.labels.includes("enhancement")) eff -= 10;
  if (issue.labels.includes("refactor") || issue.labels.includes("redesign")) eff -= 20;
  return Math.min(95, Math.max(5, eff));
}

interface GuardrailResult {
  penalty: number;
  reasons: string[];
}

function applyGuardrails(issue: BountyIssue): GuardrailResult {
  const reasons: string[] = [];
  let penalty = 0;

  if (issue.maintainer_active_days !== undefined && issue.maintainer_active_days !== 999 && issue.maintainer_active_days > 30) {
    penalty += 30;
    reasons.push("维护者超过30天未活跃");
  }
  if (issue.has_tests === false && issue.has_ci === false) {
    penalty += 25;
    reasons.push("无测试/无CI");
  }
  if (issue.labels.includes("refactor") || issue.labels.includes("redesign")) {
    penalty += 20;
    reasons.push("大规模重构任务");
  }
  if (issue.labels.includes("invalid") || issue.labels.includes("wontfix")) {
    penalty += 100;
    reasons.push("已标记为无效/不修复");
  }

  return { penalty, reasons };
}

function buildReasoning(
  rewardW: number, successP: number, clarity: number, timeE: number,
  score: number, guardrails: GuardrailResult
): string {
  const parts: string[] = [];
  parts.push(`奖励权重: ${rewardW}/100`);
  parts.push(`成功率: ${successP}/100`);
  parts.push(`清晰度: ${clarity}/100`);
  parts.push(`时间效率: ${timeE}/100`);
  parts.push(`原始分: ${score}`);
  if (guardrails.penalty > 0) {
    parts.push(`罚分: -${guardrails.penalty} (原因: ${guardrails.reasons.join("; ")})`);
  }
  parts.push(`最终分: ${Math.max(0, score - guardrails.penalty)}/100`);
  return parts.join(" | ");
}
