#!/usr/bin/env bash
set -euo pipefail

# Run from repo root regardless of the caller's cwd.
cd "$(dirname "$0")/.."

echo "[cursor env] Installing npm dependencies with lockfile"
npm ci

echo "[cursor env] Verifying Vitest is available"
npx vitest --version >/dev/null
echo "[cursor env] Vitest ready"
