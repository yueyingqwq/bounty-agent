# 🤖 Bounty Agent System

Autonomous GitHub issue hunter - 24/7 automated bounty earning system.

## Quick Start

### 1. Create GitHub Token

Go to https://github.com/settings/tokens/new and create a token with:
- `repo` (Full control of private repositories)
- `workflow` (Update GitHub Action workflows)

### 2. Configure

```powershell
cd bounty-agent
cp config.example.json config.json
# Edit config.json with your token
```

Or use environment variables:
```powershell
$env:GITHUB_TOKEN="ghp_your_token_here"
$env:GITHUB_USERNAME="your_github_username"
```

### 3. Run

```powershell
npm run dev
# Or: npm run build && npm start
```

## Architecture

```
Scout Agent (discovers issues)
  → Analyzer Agent (scores & filters)
    → Coder Agent (fixes code)
      → Validator Agent (tests & lint)
        → PR Agent (submits pull request)
```

## Scoring Formula

`final_score = reward × 0.5 + success_prob × 0.2 + clarity × 0.2 + time_efficiency × 0.1`

## Risk Filters

- ❌ Maintainer inactive > 30 days → -30 penalty
- ❌ No tests AND no CI → -25 penalty
- ❌ Large refactor tasks → -20 penalty
- ❌ Invalid/wontfix labels → -100 penalty
