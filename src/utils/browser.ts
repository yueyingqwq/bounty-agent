import type { AgentConfig } from "../core/types.js";

/**
 * Computer-Use browser integration.
 * When enabled, uses sky (Windows automation) to interact with web UIs
 * for tasks that GitHub API can't handle (e.g., Gitcoin claims, manual reviews).
 */

export class BrowserAutomation {
  private enabled: boolean;
  private state: "idle" | "navigating" | "interacting" = "idle";

  constructor(config: AgentConfig) {
    this.enabled = config.computer_use_enabled;
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  /** Navigate browser to a URL using computer-use */
  async navigate(url: string): Promise<boolean> {
    if (!this.enabled || typeof sky === "undefined") return false;
    this.state = "navigating";

    try {
      const windows = await sky.list_windows();
      const browser = windows.find(
        (w: any) => w.app?.includes("msedge") || w.app?.includes("chrome") || w.app?.includes("firefox")
      );

      if (!browser) {
        await sky.launch_app({ app: "MSEdge" });
        await new Promise((r) => setTimeout(r, 3000));
      }

      // Use the first browser window found
      const targetWindow = browser || (await sky.list_windows()).find(
        (w: any) => w.app?.includes("msedge")
      );

      if (!targetWindow) return false;

      await sky.activate_window({ window: targetWindow });
      await new Promise((r) => setTimeout(r, 500));

      // Type URL and press Enter
      await sky.press_key({ key: "Control_L+l", window: targetWindow });
      await new Promise((r) => setTimeout(r, 300));
      await sky.type_text({ text: url, window: targetWindow });
      await new Promise((r) => setTimeout(r, 200));
      await sky.press_key({ key: "Return", window: targetWindow });

      this.state = "idle";
      return true;
    } catch (err) {
      this.state = "idle";
      return false;
    }
  }

  /** Take a screenshot of the current browser view */
  async screenshot(): Promise<string | null> {
    if (!this.enabled || typeof sky === "undefined") return null;

    try {
      const windows = await sky.list_windows();
      const browser = windows.find(
        (w: any) => w.app?.includes("msedge") || w.app?.includes("chrome")
      );
      if (!browser) return null;

      const state = await sky.get_window_state({ window: browser });
      return state.screenshots?.[0]?.url || null;
    } catch {
      return null;
    }
  }
}
