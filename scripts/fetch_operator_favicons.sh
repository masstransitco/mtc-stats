#!/usr/bin/env bash
set -euo pipefail

# Fetch favicons for all agencies listed in transport-fares/gtfs/agency.txt.
# Icons are saved to public/favicons/<agency_id>.ico
# Requires: curl, awk

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
AGENCY_FILE="$ROOT_DIR/transport-fares/gtfs/agency.txt"
OUT_DIR="$ROOT_DIR/public/favicons"

mkdir -p "$OUT_DIR"

tail -n +2 "$AGENCY_FILE" | while IFS=, read -r agency_id agency_name agency_url _rest; do
  # Strip quotes if present
  agency_id="${agency_id%\"}"
  agency_id="${agency_id#\"}"
  agency_url="${agency_url%\"}"
  agency_url="${agency_url#\"}"

  if [[ -z "$agency_id" || -z "$agency_url" ]]; then
    echo "Skipping empty agency: id='$agency_id' url='$agency_url'" >&2
    continue
  fi

  # Prefer explicit icon path; fallback to /favicon.ico
  out="$OUT_DIR/${agency_id}.ico"

  IFS='|' read -ra urls <<<"$agency_url"
  success=0
  for u in "${urls[@]}"; do
    target="${u%/}/favicon.ico"
    echo "Fetching $agency_id favicon from $target"
    if curl -fsSL "$target" -o "$out"; then
      success=1
      break
    fi
  done

  if [[ $success -ne 1 ]]; then
    echo "  -> failed; skipping $agency_id" >&2
    rm -f "$out"
  fi
done

echo "Favicons saved to $OUT_DIR"
