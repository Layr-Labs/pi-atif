#!/usr/bin/env bash
set -euo pipefail

if [[ -n "${PYTHON:-}" ]]; then
  python_cmd=("$PYTHON")
elif [[ -x .venv/bin/python ]]; then
  python_cmd=(.venv/bin/python)
elif command -v python3 >/dev/null 2>&1; then
  python_cmd=(python3)
elif command -v python >/dev/null 2>&1; then
  python_cmd=(python)
else
  echo "No Python interpreter found." >&2
  exit 127
fi

if (( $# > 0 )); then
  files=("$@")
else
  shopt -s nullglob
  files=(fixtures/*.json atif-output/*.json)
  shopt -u nullglob
fi

if (( ${#files[@]} == 0 )); then
  echo "No trajectories found in fixtures/ or atif-output/." >&2
  exit 2
fi

for file in "${files[@]}"; do
  "${python_cmd[@]}" -m harbor.utils.trajectory_validator "$file"
done
