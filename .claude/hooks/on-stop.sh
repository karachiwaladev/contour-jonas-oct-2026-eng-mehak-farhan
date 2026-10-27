#!/usr/bin/env bash
# Stop hook entry point. Runs in order so the prompt log is written before the commit:
#   1. log-prompts.js appends new prompts to .claude/prompts/<session>.<branch>.jsonl
#   2. auto-commit.js commits only this session's edits and log, then pushes (see stop-scope.js)
# Both read the hook payload (session_id, transcript_path) on stdin.
dir="$(dirname "$0")"
payload="$(cat)"
printf '%s' "$payload" | node "$dir/log-prompts.js"
printf '%s' "$payload" | node "$dir/auto-commit.js"
