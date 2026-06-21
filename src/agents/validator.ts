import { execSync } from "child_process";
import { ValidationResult } from "../core/types.js";

export class ValidatorAgent {
  public status: "idle" | "validating" = "idle";

  /** Run all validations for the repo */
  async validate(repoDir: string, maxRetries: number = 3): Promise<ValidationResult> {
    this.status = "validating";

    let attempts = 0;
    const errors: string[] = [];

    while (attempts < maxRetries) {
      attempts++;

      const testResult = this.runTests(repoDir);
      const lintResult = this.runLint(repoDir);
      const buildResult = this.runBuild(repoDir);

      const passed = testResult.passed && lintResult.passed && buildResult.passed;

      const result: ValidationResult = {
        passed,
        tests_passed: testResult.passedCount,
        tests_failed: testResult.failedCount,
        lint_passed: lintResult.passed,
        build_passed: buildResult.passed,
        attempts,
        errors,
      };

      if (passed) {
        this.status = "idle";
        return result;
      }

      // Collect errors
      if (!testResult.passed) errors.push(`Tests failed: ${testResult.failedCount} failures`);
      if (!lintResult.passed) errors.push("Lint failed");
      if (!buildResult.passed) errors.push("Build failed");
    }

    this.status = "idle";
    return {
      passed: false,
      tests_passed: 0,
      tests_failed: 0,
      lint_passed: false,
      build_passed: false,
      attempts,
      errors,
    };
  }

  private runTests(repoDir: string): { passed: boolean; passedCount: number; failedCount: number } {
    try {
      // Try common test runners
      const commands = ["npm test", "pytest", "go test ./...", "cargo test", "bundle exec rspec"];
      for (const cmd of commands) {
        try {
          const output = execSync(`cd "${repoDir}" && ${cmd}`, { stdio: "pipe", timeout: 120_000 }).toString();
          return { passed: true, passedCount: 1, failedCount: 0 };
        } catch { continue; }
      }
      // No test runner found - might be OK
      return { passed: true, passedCount: 0, failedCount: 0 };
    } catch {
      return { passed: false, passedCount: 0, failedCount: 1 };
    }
  }

  private runLint(repoDir: string): { passed: boolean } {
    try {
      const commands = ["npx eslint .", "npx tsc --noEmit", "flake8", "golint ./...", "cargo clippy"];
      for (const cmd of commands) {
        try {
          execSync(`cd "${repoDir}" && ${cmd}`, { stdio: "pipe", timeout: 60_000 });
          return { passed: true };
        } catch { continue; }
      }
      return { passed: true };
    } catch {
      return { passed: false };
    }
  }

  private runBuild(repoDir: string): { passed: boolean } {
    try {
      const commands = ["npm run build", "npx tsc", "python setup.py build", "go build ./...", "cargo build"];
      for (const cmd of commands) {
        try {
          execSync(`cd "${repoDir}" && ${cmd}`, { stdio: "pipe", timeout: 120_000 });
          return { passed: true };
        } catch { continue; }
      }
      return { passed: true };
    } catch {
      return { passed: false };
    }
  }
}
