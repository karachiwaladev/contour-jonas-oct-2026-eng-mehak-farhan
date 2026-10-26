#!/usr/bin/env bash
# Stop hook entry point. Runs in order so the prompt log is written before the commit:
#   1. log-prompts.js appends new prompts to .claude/prompts.jsonl (reads the hook payload on stdin)
#   2. auto-commit.js commits everything and pushes (non-destructive)
dir="$(dirname "$0")"
payload="$(cat)"
printf '%s' "$payload" | node "$dir/log-prompts.js"
node "$dir/auto-commit.js"
