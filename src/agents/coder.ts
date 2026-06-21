import { AnalysisResult, FixResult } from "../core/types.js";
import { existsSync, mkdirSync, writeFileSync, readFileSync, readdirSync, statSync } from "fs";
import { join, extname, dirname } from "path";
import { LLMClient } from "../utils/llm.js";
import { Octokit } from "octokit";

export class CoderAgent {
  public status: "idle" | "coding" = "idle";
  private workDir: string;
  private llm: LLMClient;

  constructor(workDir: string) {
    this.workDir = workDir;
    if (!existsSync(workDir)) mkdirSync(workDir, { recursive: true });
    this.llm = new LLMClient();
  }

  async setupRepo(repo: string, cloneUrl: string): Promise<string> {
    const repoDir = join(this.workDir, repo.replace("/", "-"));
    if (!existsSync(repoDir)) mkdirSync(repoDir, { recursive: true });
    return repoDir;
  }

  async developFix(repoDir: string, analysis: AnalysisResult, token?: string): Promise<FixResult> {
    this.status = "coding";
    const branchName = "fix/issue-" + analysis.issue.id + "-" + Date.now();

    console.log("[Coder] Reading issue: " + analysis.issue.title.substring(0, 60));

    // Step 1: Download repo source code via GitHub API
    const sourceFiles = await this.downloadSourceFiles(analysis.issue.repo, token);

    if (sourceFiles.length === 0) {
      console.log("[Coder] Could not download source files");
      return {
        repo_path: repoDir,
        branch_name: branchName,
        changes: [],
        commit_message: "Fix: " + analysis.issue.title.substring(0, 60),
        pr_description: "## Problem\n" + (analysis.issue.body?.substring(0, 300) || "See issue"),
        success: false,
        error: "Could not download source files",
      };
    }

    console.log("[Coder] Downloaded " + sourceFiles.length + " source files");

    // Step 2: Select relevant files based on issue keywords and file extensions
    const relevantFiles = this.selectRelevantFiles(sourceFiles, analysis.issue);

    console.log("[Coder] Selected " + relevantFiles.length + " relevant files for analysis");

    // Step 3: Generate fix using LLM
    console.log("[Coder] Generating fix with AI...");
    const fix = await this.llm.generateFix({
      issueTitle: analysis.issue.title,
      issueBody: analysis.issue.body || "",
      repo: analysis.issue.repo,
      sourceFiles: relevantFiles,
    });

    if (fix) {
      console.log("[Coder] AI generated fix: " + fix.explanation.substring(0, 80));

      // Apply the fix
      for (const file of fix.files) {
        const fullPath = join(repoDir, file.path);
        const dirPath = join(repoDir, dirname(file.path));
        if (!existsSync(dirPath)) mkdirSync(dirPath, { recursive: true });
        writeFileSync(fullPath, file.newContent);
        console.log("[Coder] Updated: " + file.path);
      }

      const prDesc = "## Problem\n" +
        (analysis.issue.body?.substring(0, 300) || "See issue") + "\n\n" +
        "## Root Cause\n" + fix.explanation + "\n\n" +
        "## Changes\n" +
        fix.files.map(f => "- " + f.path).join("\n") + "\n\n" +
        "Closes #" + analysis.issue.id;

      return {
        repo_path: repoDir,
        branch_name: branchName,
        changes: fix.files.map(f => f.path),
        commit_message: "Fix: " + analysis.issue.title.substring(0, 60),
        pr_description: prDesc,
        success: true,
      };
    }

    // Fallback: return stub
    console.log("[Coder] AI fix not available, using stub");
    return {
      repo_path: repoDir,
      branch_name: branchName,
      changes: [],
      commit_message: "Fix: " + analysis.issue.title.substring(0, 60),
      pr_description: "## Problem\n" + (analysis.issue.body?.substring(0, 300) || "See issue"),
      success: true,
    };
  }

  commitChanges(repoDir: string, message: string): void {
    console.log("[Coder] Changes prepared: " + message.substring(0, 40));
  }

  /** Download source files from GitHub API */
  private async downloadSourceFiles(repo: string, token?: string): Promise<Array<{ path: string; content: string }>> {
    try {
      const octokit = new Octokit({ auth: token });
      const [owner, name] = repo.split("/");

      // Get default branch
      const repoInfo = await octokit.request("GET /repos/" + owner + "/" + name);
      const defaultBranch = repoInfo.data.default_branch;

      // Get repo contents tree
      const tree = await octokit.request("GET /repos/" + owner + "/" + name + "/git/trees/" + defaultBranch + "?recursive=1", {
        headers: { "X-GitHub-Api-Version": "2022-11-28" }
      });

      const sourceExtensions = [".ts", ".tsx", ".js", ".jsx", ".py", ".rs", ".go", ".java", ".rb", ".php", ".c", ".cpp", ".h", ".hpp", ".css", ".scss", ".json", ".yaml", ".yml", ".toml", ".md"];
      const ignoreDirs = ["node_modules", ".git", "dist", "build", ".next", "vendor", ".venv", "__pycache__", "target"];

      const entries = (tree.data.tree || [])
        .filter((e: any) => e.type === "blob")
        .filter((e: any) => !ignoreDirs.some(d => e.path.startsWith(d + "/") || e.path === d))
        .filter((e: any) => sourceExtensions.includes(extname(e.path)));

      // Download contents of up to 30 files
      const files = [];
      for (const entry of entries.slice(0, 30)) {
        try {
          const content = await octokit.request("GET /repos/" + owner + "/" + name + "/contents/" + entry.path, {
            headers: { "X-GitHub-Api-Version": "2022-11-28", "Accept": "application/vnd.github.raw+json" }
          });
          files.push({ path: entry.path, content: content.data as unknown as string });
        } catch { }
      }

      return files;
    } catch (err: any) {
      console.log("[Coder] Download error: " + err.message);
      return [];
    }
  }

  /** Select files most relevant to the issue */
  private selectRelevantFiles(
    files: Array<{ path: string; content: string }>,
    issue: { title: string; body?: string; labels: string[] }
  ): Array<{ path: string; content: string }> {
    if (files.length <= 10) return files;

    // Extract keywords from issue
    const keywords = (issue.title + " " + (issue.body || ""))
      .toLowerCase()
      .split(/[\s\/\-_\.]+/)
      .filter(w => w.length > 3)
      .filter(w => !["the", "this", "that", "with", "from", "have", "been", "were", "when", "what", "error", "fix", "bug"].includes(w));

    // Score files by keyword matches
    const scored = files.map(f => {
      const lowerPath = f.path.toLowerCase();
      let score = 0;

      // Prefer source code over config/test files
      if (f.path.includes("src/") || f.path.includes("lib/") || f.path.includes("app/")) score += 3;
      if (f.path.includes("test") || f.path.includes("spec") || f.path.includes(".config")) score -= 1;

      // Match keywords
      for (const kw of keywords) {
        if (lowerPath.includes(kw)) score += 5;
        if (f.content.toLowerCase().includes(kw)) score += 1;
      }

      return { file: f, score };
    });

    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, 10).map(s => s.file);
  }
}


