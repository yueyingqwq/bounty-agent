import OpenAI from "openai";
import { readFileSync, existsSync } from "fs";

export interface LLMConfig {
  apiKey: string;
  model: string;
  baseURL?: string;
}

export class LLMClient {
  private client: OpenAI;
  private model: string;
  private enabled: boolean;

  constructor(config?: Partial<LLMConfig>) {
    let apiKey = config?.apiKey || process.env.OPENAI_API_KEY || "";

    // Also check config.json
    if (!apiKey && existsSync("./config.json")) {
      try {
        const cfg = JSON.parse(readFileSync("./config.json", "utf-8"));
        if (cfg.openai_api_key) apiKey = cfg.openai_api_key;
      } catch {}
    }

    this.model = config?.model || "gpt-4o";

    if (!apiKey) {
      this.enabled = false;
      this.client = null as any;
      return;
    }

    this.enabled = true;
    this.client = new OpenAI({
      apiKey,
      baseURL: config?.baseURL || undefined,
    });
  }

  get isEnabled(): boolean { return this.enabled; }

  async generateFix(params: {
    issueTitle: string;
    issueBody: string;
    repo: string;
    sourceFiles: Array<{ path: string; content: string }>;
  }): Promise<{
    files: Array<{ path: string; originalContent: string; newContent: string }>;
    explanation: string;
  } | null> {
    if (!this.enabled) return null;

    const fileContext = params.sourceFiles.map(f =>
      "--- " + f.path + " ---\n" + f.content + (f.content.endsWith("\n") ? "" : "\n")
    ).join("\n");

    const systemPrompt = "You are an expert software engineer fixing a GitHub issue.\n" +
      "Rules:\n- Minimal changes, same code style\n- Only modify files that need changes\n" +
      "Output JSON ONLY:\n" + JSON.stringify({
        explanation: "root cause and fix description",
        files: [{ path: "relative/file/path", newContent: "complete new file content" }]
      });

    const userPrompt = "## Issue: " + params.issueTitle + "\n\n" +
      "## Description\n" + params.issueBody.substring(0, 2000) + "\n\n" +
      "## Repository: " + params.repo + "\n\n" +
      "## Source Files\n" + fileContext.substring(0, 8000);

    try {
      const response = await this.client.chat.completions.create({
        model: this.model,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        response_format: { type: "json_object" },
        temperature: 0.1,
        max_tokens: 4096,
      });

      const text = response.choices[0]?.message?.content;
      if (!text) return null;

      const result = JSON.parse(text);

      return {
        explanation: result.explanation || "AI-generated fix",
        files: result.files.map((f: any) => ({
          path: f.path,
          originalContent: params.sourceFiles.find(sf => sf.path === f.path)?.content || "",
          newContent: f.newContent,
        })),
      };
    } catch (err: any) {
      console.error("[LLM] Error: " + err.message);
      return null;
    }
  }
}
