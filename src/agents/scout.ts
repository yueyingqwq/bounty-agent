import { GitHubClient } from "../utils/github.js";
import { BountyIssue, AgentStatus } from "../core/types.js";
import { Storage } from "../core/storage.js";

export class ScoutAgent {
  private github: GitHubClient;
  private storage: Storage;
  public status: AgentStatus = "idle";

  constructor(github: GitHubClient, storage: Storage) {
    this.github = github;
    this.storage = storage;
  }

  /** Main scan cycle: discover new issues across platforms */
  async scan(): Promise<BountyIssue[]> {
    this.status = "scanning";
    const allIssues: BountyIssue[] = [];

    try {
      // 1. GitHub: help wanted + good first issues
      const githubIssues = await this.github.fastSearch();
      allIssues.push(...githubIssues);

      // 2. GitHub: sponsored/bounty-labeled issues
      const sponsoredIssues = await this.github.fastSearch(
        "label:sponsored state:open is:issue"
      );
      allIssues.push(...sponsoredIssues);

      // 3. GitHub: bug issues in popular repos (high reward potential)
      const bugIssues = await this.github.fastSearch(
        "label:bug state:open is:issue comments:>3"
      );
      allIssues.push(...bugIssues);

      // Deduplicate by repo+id
      const seen = new Set<string>();
      const uniqueIssues = allIssues.filter((issue) => {
        const key = `${issue.repo}#${issue.id}`;
        if (seen.has(key) || this.storage.isIssueProcessed(issue.repo, issue.id)) return false;
        seen.add(key);
        return true;
      });

      this.status = "idle";
      return uniqueIssues;
    } catch (err) {
      this.status = "error";
      throw err;
    }
  }
}
