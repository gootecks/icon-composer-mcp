#!/bin/bash
# hk fix command for Markdown: rumdl check --fix, then the repo-markdown-fixer
# agent on what rumdl cannot fix. Fails while findings remain.
# RUMDL_AGENT=0 skips the agent; the agent also never runs under CI.
set -euo pipefail

rumdl check --fix "$@" || true
rumdl check "$@" && exit 0

agent="${RUMDL_AGENT_FILE:-$HOME/.omp/agent/agents/repo-markdown-fixer.md}"
if [[ ${RUMDL_AGENT:-1} == 0 || -n ${RUMDL_AGENT_RUNNING:-} || -n ${CI:-} ]]; then
    exit 1
fi
if ! command -v omp > /dev/null || [[ ! -f $agent ]]; then
    echo "rumdl-fix: omp or $agent missing; fix the findings above by hand" >&2
    exit 1
fi

model=$(awk 'NR > 1 && /^---$/ { exit } sub(/^model: */, "")' "$agent")
prompt=$(awk 'f; /^---$/ && ++n == 2 { f = 1 }' "$agent")
findings=$(rumdl check --output-format json "$@" 2> /dev/null || true)
files=$(jq -r '.[].file' <<< "$findings" 2> /dev/null | sort -u | tr '\n' ' ' || true)
if [[ -z ${files// /} ]]; then
    echo "rumdl-fix: no file with findings to give the agent; fix them by hand" >&2
    exit 1
fi

echo "rumdl-fix: asking repo-markdown-fixer ($model) to fix the findings above" >&2
RUMDL_AGENT_RUNNING=1 omp -p --no-session --no-title --no-skills --no-rules \
    --model "$model" --append-system-prompt "$prompt" \
    --tools read,edit,grep,glob,bash --max-time "${RUMDL_AGENT_MAX_TIME:-5m}" \
    "Repository root: $PWD
Linter: rumdl
Files: $files
Findings from rumdl check --output-format json, after rumdl check --fix:
$findings" >&2 || echo "rumdl-fix: the agent failed" >&2

rumdl check --fix "$@" || true
rumdl check "$@"
