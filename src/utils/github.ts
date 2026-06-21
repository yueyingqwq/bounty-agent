import { Octokit } from "octokit";
import { BountyIssue } from "../core/types.js";

export class GitHubClient {
  private octokit: Octokit;
  public username: string;

  constructor(token: string, username: string) {
    this.octokit = new Octokit({ auth: token });
    this.username = username;
  }

  /** Search for bounty/help-wanted/bug issues across GitHub */
  async searchBountyIssues(query?: string): Promise<BountyIssue[]> {
    const q = query || "label:help+wanted label:good+first+issue state:open";
    const results = await this.octokit.request(`GET /search/issues`, {
        q,
      sort: "updated",
      order: "desc",
      per_page: 50,
      headers: { "X-GitHub-Api-Version": "2022-11-28" }
    });

    const issues: BountyIssue[] = [];

    for (const item of results.data.items) {
      if (item.pull_request) continue;

      const repoFullName = item.repository_url.replace("https://api.github.com/repos/", "");

      const labels = item.labels.map((l: any) => typeof l === "string" ? l : l.name).filter(Boolean) as string[];

      const repoInfo = await this.checkRepoHealth(repoFullName);

      issues.push({
        id: item.number,
        repo: repoFullName,
        title: item.title,
        body: item.body || "",
        html_url: item.html_url,
        labels,
        reward_estimate: extractBountyAmount(item.body || "", labels, item.title),
        platform: "github",
        created_at: item.created_at,
        updated_at: item.updated_at,
        language: repoInfo.language,
        has_tests: repoInfo.hasTests,
        has_ci: repoInfo.hasCI,
        maintainer_active_days: repoInfo.maintainerActiveDays,
        comments_count: item.comments,
        state: item.state as "open" | "closed",
      });
    }

    return issues;
  }

  /** Fork a repo */
  async forkRepo(repo: string): Promise<string> {
    const [owner, name] = repo.split("/");
    const fork = await this.octokit.rest.repos.createFork({ owner, name } as any);
    return fork.data.clone_url;
  }

  /** Create a Pull Request */
  async createPR(repo: string, branch: string, title: string, body: string): Promise<{ url: string; number: number }> {
    const [owner, name] = repo.split("/");
    const pr = await this.octokit.rest.pulls.create({
      owner,
      repo: name,
      title,
      head: `${this.username}:${branch}`,
      base: "main",
      body,
    });
    return { url: pr.data.html_url, number: pr.data.number };
  }

  /** Fast scan - no deep repo health checks for speed */
  async fastSearch(query?: string): Promise<BountyIssue[]> {
    const q = query || 'label:help+wanted state:open is:issue';
    const results = await this.octokit.request('GET /search/issues', {
      q,
      sort: "updated",
      order: "desc",
      per_page: 50,
      headers: { "X-GitHub-Api-Version": "2022-11-28" }
    });

    return results.data.items
      .filter((item: any) => !item.pull_request)
      .map((item: any) => {
        const repoFullName = item.repository_url.replace('https://api.github.com/repos/', '');
        const labels = item.labels.map((l: any) => typeof l === 'string' ? l : l.name).filter(Boolean) as string[];
        return {
          id: item.number,
          repo: repoFullName,
          title: item.title,
          body: item.body || "",
          html_url: item.html_url,
          labels,
          reward_estimate: extractBountyAmount(item.body || "", labels, item.title),
          platform: "github" as const,
          created_at: item.created_at,
          updated_at: item.updated_at,
          language: undefined,
          has_tests: undefined,
          has_ci: undefined,
          maintainer_active_days: undefined,
          comments_count: item.comments,
          state: item.state as "open" | "closed",
        };
      });
  }

  private async checkRepoHealth(repo: string): Promise<{
    language: string | undefined;
    hasTests: boolean;
    hasCI: boolean;
    maintainerActiveDays: number;
  }> {
    try {
      const [owner, name] = repo.split("/");

      const [repoResp, commitsResp] = await Promise.all([
        this.octokit.rest.repos.get({ owner, repo: name } as any),
        this.octokit.rest.repos.listCommits({ owner, repo: name, per_page: 1 } as any),
      ]);

      const language = repoResp.data.language;
      const hasTests = !!(repoResp.data.topics?.includes("testing") ||
        repoResp.data.description?.toLowerCase().includes("test"));
      const hasCI = !!repoResp.data.allow_merge_commit;

      let maintainerActiveDays = 999;
      if (commitsResp.data.length > 0) {
        const lastCommit = new Date(commitsResp.data[0].commit.committer?.date || commitsResp.data[0].commit.author?.date || "");
        maintainerActiveDays = Math.floor((Date.now() - lastCommit.getTime()) / (1000 * 60 * 60 * 24));
      }

      return { language: language ?? undefined, hasTests, hasCI, maintainerActiveDays };
    } catch {
      return { language: undefined, hasTests: false, hasCI: false, maintainerActiveDays: 999 };
    }
  }
}

function extractBountyAmount(body: string, labels: string[], title?: string): number {
  for (const label of labels) {
    const match = label.match(/\$?(\d+)/);
    if (match) return parseInt(match[1]);
  }

  const patterns = [
    /bounty:\s*\$?(\d+)/i,
    /reward:\s*\$?(\d+)/i,
    /price:\s*\$?(\d+)/i,
    /\$(\d+)\s*bounty/i,
    /\$(\d+)\s*reward/i,
  ];

  for (const pattern of patterns) {
    const match = body.match(pattern);
    if (match) return parseInt(match[1]);
  }

  // Check title for bounty patterns
  if (title) {
    const titleRegex = /\$(\d+)\s*BOUNTY/i;
    const match = title.match(titleRegex);
    if (match) return parseInt(match[1]);
  }

  return 0;
}
