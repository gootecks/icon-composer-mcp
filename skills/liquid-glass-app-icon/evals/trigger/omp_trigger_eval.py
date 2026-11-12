"""Trigger eval for a skill description using `omp -p`.

Port of skill-creator's run_eval.py, which drives `claude -p`. For each query a
throwaway project is made with the candidate description in
.omp/skills/<name>/SKILL.md, `omp -p --mode=json` runs the query there, and the
run counts as triggered when the agent reads skill://<name>.

Usage:
  uv run omp_trigger_eval.py --eval-set set.json --name liquid-glass-app-icon \
      --description-file desc.txt --runs 3 --workers 5 --out results.json
"""

import argparse
import json
import shutil
import subprocess
import tempfile
import time
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

STUB_BODY = "# Stub\n\nThis is a test stub. Reply with the single word OK and stop.\n"


def run_single_query(query: str, name: str, description: str, timeout: int) -> bool:
    project = Path(tempfile.mkdtemp(prefix="omp-trigger-"))
    skill_dir = project / ".omp" / "skills" / name
    skill_dir.mkdir(parents=True)
    front = f"---\nname: {name}\ndescription: {json.dumps(description)}\n---\n\n"
    (skill_dir / "SKILL.md").write_text(front + STUB_BODY)
    target = f"skill://{name}"
    process = subprocess.Popen(
        ["omp", "-p", query, "--mode=json", "--no-session"],
        stdout=subprocess.PIPE,
        stderr=subprocess.DEVNULL,
        cwd=project,
        text=True,
    )
    deadline = time.time() + timeout
    triggered = False
    try:
        for line in process.stdout:
            if time.time() > deadline:
                break
            try:
                event = json.loads(line)
            except json.JSONDecodeError:
                continue
            kind = event.get("type")
            if kind == "tool_execution_start":
                path = str(event.get("args", {}).get("path", ""))
                triggered = path.startswith(target)
                break
            if kind == "agent_end":
                break
    finally:
        process.kill()
        process.wait()
        shutil.rmtree(project, ignore_errors=True)
    return triggered


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--eval-set", required=True)
    parser.add_argument("--name", required=True)
    parser.add_argument("--description-file", required=True)
    parser.add_argument("--runs", type=int, default=3)
    parser.add_argument("--workers", type=int, default=5)
    parser.add_argument("--timeout", type=int, default=120)
    parser.add_argument("--out", required=True)
    args = parser.parse_args()

    eval_set = json.loads(Path(args.eval_set).read_text())
    description = Path(args.description_file).read_text().strip()
    jobs = [(i, item["query"]) for i, item in enumerate(eval_set) for _ in range(args.runs)]

    with ThreadPoolExecutor(max_workers=args.workers) as pool:
        outcomes = list(
            pool.map(lambda job: run_single_query(job[1], args.name, description, args.timeout), jobs)
        )

    results = []
    for i, item in enumerate(eval_set):
        hits = sum(outcome for (index, _), outcome in zip(jobs, outcomes) if index == i)
        rate = hits / args.runs
        results.append(
            {
                "query": item["query"],
                "should_trigger": item["should_trigger"],
                "trigger_rate": rate,
                "pass": (rate >= 0.5) == item["should_trigger"],
            }
        )
    passed = sum(result["pass"] for result in results)
    Path(args.out).write_text(
        json.dumps({"description": description, "passed": passed, "total": len(results), "results": results}, indent=2)
    )
    print(f"{passed}/{len(results)} passed")
    for result in results:
        if not result["pass"]:
            print(f"  FAIL rate={result['trigger_rate']:.2f} expected={result['should_trigger']}: {result['query'][:90]}")


if __name__ == "__main__":
    main()
