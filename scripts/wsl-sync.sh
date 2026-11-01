#!/usr/bin/env bash
# Windows edits live on D:; builds run in WSL's native filesystem for speed and so the
# Linux-only NEAR sandbox binary works. Copies sources over, keeping WSL build artefacts.
set -euo pipefail
SRC=/mnt/d/code/settled/
DST="${SETTLED_WSL_DIR:-$HOME/code/settled}/"
mkdir -p "$DST"
rsync -a --delete \
  --exclude node_modules --exclude target --exclude .next --exclude .settled \
  --exclude playwright-report --exclude test-results --exclude .git \
  "$SRC" "$DST"
echo "synced to $DST"
