#!/usr/bin/env bash
# Runs ONE ca-full-cycle Implement cluster in Codex CLI (codex exec), non-interactive.
# Usage: codex-worker.sh <checkout abs path> <label> <low|mid|high> <payload file> [log dir]
# Tier → model: low gpt-6-luna/low · mid gpt-6-sol/medium · high gpt-6-astra/high (escalation only).
# Env CODEX_EFFORT=low|medium|high overrides the effort only — set it only when the user names one.
# Exit: 0 done · 10 auth lock (not a ChatGPT-plan login — would bill the API) ·
#       11 plan usage limit hit · 12 codex failed otherwise · 2 bad usage.
# Last stdout line is always `CODEX_RESULT: <ok|auth-lock|limit|failed> ...` for the orchestrator.
set -u
WT=${1:-}; LABEL=${2:-}; TIER=${3:-}; PAYLOAD=${4:-}; LOGS=${5:-${TMPDIR:-/tmp}/codex-workers}
[ -n "$WT" ] && [ -n "$LABEL" ] && [ -n "$TIER" ] && [ -n "$PAYLOAD" ] || { echo "CODEX_RESULT: failed usage: <checkout> <label> <low|mid|high> <payload> [log dir]"; exit 2; }
case "$LABEL" in *[!A-Za-z0-9_-]*) echo "CODEX_RESULT: failed bad label"; exit 2 ;; esac
case "$TIER" in
  low) MODEL=gpt-6-luna; EFFORT=low ;;
  mid) MODEL=gpt-6-sol; EFFORT=medium ;;
  high) MODEL=gpt-6-astra; EFFORT=high ;;
  *) echo "CODEX_RESULT: failed bad tier: $TIER"; exit 2 ;;
esac
# CODEX_EFFORT overrides the effort only, when the user asks (e.g. Astra at low effort).
case "${CODEX_EFFORT:-}" in
  "") ;;
  low|medium|high) EFFORT=$CODEX_EFFORT ;;
  *) echo "CODEX_RESULT: failed bad CODEX_EFFORT: $CODEX_EFFORT"; exit 2 ;;
esac
[ -f "$PAYLOAD" ] || { echo "CODEX_RESULT: failed no payload file"; exit 2; }
GITDIR=$(git -C "$WT" rev-parse --path-format=absolute --git-common-dir 2>/dev/null) || { echo "CODEX_RESULT: failed not a git checkout"; exit 2; }
mkdir -p "$LOGS"

# Auth lock: only the ChatGPT-plan login is allowed; an API key would turn the run into metered billing.
status=$(env -u OPENAI_API_KEY -u CODEX_API_KEY codex login status 2>&1)
case "$status" in
  *ChatGPT*) ;;
  *) echo "CODEX_RESULT: auth-lock codex is not logged in with a ChatGPT plan: ${status%%$'\n'*}"; exit 10 ;;
esac

# Live progress for the Zen band (mods-menu reads the last line while this command runs).
PROGRESS="$HOME/.cache/zen-progress/$LABEL.txt"
mkdir -p "${PROGRESS%/*}" && : >"$PROGRESS"
trap 'rm -f "$PROGRESS"' EXIT

start=$(date +%s)
env -u OPENAI_API_KEY -u CODEX_API_KEY codex exec -C "$WT" -s workspace-write \
  -m "$MODEL" -c model_reasoning_effort="$EFFORT" \
  --add-dir "$GITDIR" \
  -c sandbox_workspace_write.network_access=true \
  --json -o "$LOGS/$LABEL.last" - <"$PAYLOAD" 2>"$LOGS/$LABEL.err" |
  tee "$LOGS/$LABEL.jsonl" |
  { jq -nR --unbuffered -r -f "$(dirname "$0")/codex-progress.jq" >>"$PROGRESS" 2>/dev/null; cat >/dev/null; }
code=${PIPESTATUS[0]}
secs=$(($(date +%s) - start))
usage=$(jq -c 'select(.usage) | .usage' "$LOGS/$LABEL.jsonl" 2>/dev/null | tail -1)

echo "[$LABEL] $TIER → $MODEL/$EFFORT · exit $code · ${secs}s · usage ${usage:-n/a} · logs $LOGS/$LABEL.*"
echo "[$LABEL] last message:"
head -c 1500 "$LOGS/$LABEL.last" 2>/dev/null
echo

# Plan limit: judged only from Codex's own error events and stderr, never from the agent's prose.
errors=$({
  jq -c 'select(.type == "error" or .type == "turn.failed")' "$LOGS/$LABEL.jsonl" 2>/dev/null
  tail -20 "$LOGS/$LABEL.err"
})
if printf '%s' "$errors" | grep -Eqi 'usage.?limit|rate.?limit|quota|too many requests|[^0-9]429[^0-9]'; then
  echo "CODEX_RESULT: limit $(printf '%s' "$errors" | grep -Eio '[^"]*(usage.?limit|rate.?limit|quota|too many requests)[^"]*' | head -1)"
  exit 11
fi
if [ "$code" -ne 0 ] || printf '%s' "$errors" | grep -q 'turn.failed'; then
  echo "CODEX_RESULT: failed exit $code — see $LOGS/$LABEL.err"
  exit 12
fi
echo "CODEX_RESULT: ok ${secs}s usage ${usage:-n/a}"
