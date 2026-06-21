import { GitHubClient } from "../utils/github.js";
import { AnalysisResult, FixResult, PRResult, AgentConfig } from "../core/types.js";
import { Octokit } from "octokit";
import { readFileSync } from "fs";
import { join } from "path";

export class PRAgent {
  private github: GitHubClient;
  private config: AgentConfig;
  public status: "idle" | "submitting" = "idle";

  constructor(github: GitHubClient, config: AgentConfig) {
    this.github = github;
    this.config = config;
  }

  async submit(repo: string, fix: FixResult, analysis: AnalysisResult): Promise<PRResult> {
    this.status = "submitting";

    try {
      const [owner, name] = repo.split("/");
      const octokit = new Octokit({ auth: this.config.github_token });

      // Step 1: Fork the repo
      console.log("[PR Agent] Forking " + repo + "...");
      const fork = await octokit.request("POST /repos/" + owner + "/" + name + "/forks", {});
      console.log("[PR Agent] Fork result: " + fork.data.full_name);

      // Wait for fork to be ready
      await new Promise(r => setTimeout(r, 3000));

      // Step 2: Get the default branch SHA
      const forkOwner = fork.data.owner.login;
      const forkName = fork.data.name;
      const branchInfo = await octokit.request("GET /repos/" + forkOwner + "/" + forkName + "/branches/" + fork.data.default_branch);
      const baseSha = branchInfo.data.commit.sha;

      // Step 3: Create a new branch
      const branchName = "fix/issue-" + analysis.issue.id + "-" + Date.now();
      await octokit.request("POST /repos/" + forkOwner + "/" + forkName + "/git/refs", {
        ref: "refs/heads/" + branchName,
        sha: baseSha,
      });

      // Step 4: Upload modified files
      for (const filePath of fix.changes) {
        try {
          const content = readFileSync(join(fix.repo_path, filePath));
          const encoded = content.toString("base64");
          await octokit.request("PUT /repos/" + forkOwner + "/" + forkName + "/contents/" + filePath, {
            message: fix.commit_message,
            content: encoded,
            branch: branchName,
          });
          console.log("[PR Agent] Uploaded: " + filePath);
        } catch (e: any) {
          console.log("[PR Agent] Upload warning: " + e.message);
        }
      }

      // Step 5: Create Pull Request
      console.log("[PR Agent] Creating PR...");
      fork.data.default_branch = fork.data.default_branch || "main";
      const pr = await octokit.request("POST /repos/" + owner + "/" + name + "/pulls", {
        title: fix.commit_message,
        head: forkOwner + ":" + branchName,
        base: fork.data.default_branch,
        body: fix.pr_description,
      });

      this.status = "idle";
      console.log("[PR Agent] PR created: " + pr.data.html_url);
      return { pr_url: pr.data.html_url, pr_number: pr.data.number, success: true };
    } catch (err: any) {
      this.status = "idle";
      console.error("[PR Agent] Failed: " + err.message);
      return { pr_url: "", pr_number: 0, success: false, error: err.message };
    }
  }
}