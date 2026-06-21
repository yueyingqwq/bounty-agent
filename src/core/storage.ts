import Database from "better-sqlite3";
import { join } from "path";
import { mkdirSync, existsSync } from "fs";
import { TaskRecord } from "./types.js";

export class Storage {
  private db: Database.Database;

  constructor(dataDir: string) {
    if (!existsSync(dataDir)) mkdirSync(dataDir, { recursive: true });
    this.db = new Database(join(dataDir, "bounty-agent.db"));
    this.db.pragma("journal_mode = WAL");
    this.initTables();
  }

  private initTables(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS processed_issues (
        id INTEGER NOT NULL,
        repo TEXT NOT NULL,
        title TEXT,
        score REAL DEFAULT 0,
        status TEXT DEFAULT 'queued',
        reward_estimate REAL DEFAULT 0,
        reward_earned REAL DEFAULT 0,
        pr_url TEXT,
        error TEXT,
        started_at TEXT,
        completed_at TEXT,
        created_at TEXT DEFAULT (datetime('now')),
        PRIMARY KEY (id, repo)
      );

      CREATE TABLE IF NOT EXISTS repo_risk_scores (
        repo TEXT PRIMARY KEY,
        risk_score REAL DEFAULT 0,
        has_ci INTEGER DEFAULT 0,
        has_tests INTEGER DEFAULT 0,
        maintainer_active_days INTEGER DEFAULT 0,
        last_checked TEXT DEFAULT (datetime('now'))
      );
    `);
  }

  isIssueProcessed(repo: string, issueId: number): boolean {
    const row = this.db.prepare(
      "SELECT 1 FROM processed_issues WHERE repo = ? AND id = ?"
    ).get(repo, issueId);
    return !!row;
  }

  saveIssue(record: Omit<TaskRecord, "created_at">): void {
    this.db.prepare(`
      INSERT OR REPLACE INTO processed_issues
        (id, repo, title, score, status, reward_estimate, reward_earned, pr_url, error, started_at, completed_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      record.issue_id, record.repo, null, record.score,
      record.status, 0, record.reward_earned, record.pr_url ?? null,
      record.error ?? null, record.started_at ?? null, record.completed_at ?? null
    );
  }

  updateIssueStatus(repo: string, issueId: number, status: string, prUrl?: string, error?: string): void {
    this.db.prepare(`
      UPDATE processed_issues
      SET status = ?, pr_url = COALESCE(?, pr_url), error = COALESCE(?, error),
          completed_at = CASE WHEN ? IN ('success','failed') THEN datetime('now') ELSE NULL END
      WHERE repo = ? AND id = ?
    `).run(status, prUrl ?? null, error ?? null, status, repo, issueId);
  }

  getPendingTasks(): TaskRecord[] {
    return this.db.prepare(
      "SELECT * FROM processed_issues WHERE status = 'queued' ORDER BY score DESC"
    ).all() as TaskRecord[];
  }

  getStats(): { total: number; success: number; failed: number; totalReward: number } {
    const row = this.db.prepare(`
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN status = 'success' THEN 1 ELSE 0 END) as success,
        SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed,
        COALESCE(SUM(reward_earned), 0) as total_reward
      FROM processed_issues
    `).get() as any;
    return { total: row.total, success: row.success, failed: row.failed, totalReward: row.total_reward };
  }

  close(): void {
    this.db.close();
  }
}
