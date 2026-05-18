#!/bin/bash
set -euo pipefail
# 既存テーブルへのデフォルトルール再投入・リセット
# Usage: ENVIRONMENT=dev ./scripts/seed-rules.sh [--overwrite]
#
# 通常: assets/seed-rules/*.put.json を冪等に投入（既存があれば skip）
# --overwrite: 既存を強制上書き（デフォルトルールのリセット用途）

ENV="${ENVIRONMENT:-dev}"

case "$ENV" in
  production) TABLE="ImageCompositor-Rules" ;;
  *)          TABLE="ImageCompositor-Rules-${ENV}" ;;
esac

OVERWRITE="false"
if [ "${1:-}" = "--overwrite" ]; then
  OVERWRITE="true"
fi

SEED_DIR="$(cd "$(dirname "$0")/.." && pwd)/assets/seed-rules"

if ! ls "$SEED_DIR"/*.put.json >/dev/null 2>&1; then
  echo "No *.put.json files in $SEED_DIR" >&2
  exit 1
fi

for SEED_FILE in "$SEED_DIR"/*.put.json; do
  echo "Seeding: $(basename "$SEED_FILE") → $TABLE"
  if [ "$OVERWRITE" = "true" ]; then
    aws dynamodb put-item --table-name "$TABLE" --item file://"$SEED_FILE"
    echo "  → wrote (overwrite)"
  else
    if aws dynamodb put-item \
        --table-name "$TABLE" \
        --item file://"$SEED_FILE" \
        --condition-expression 'attribute_not_exists(ruleId)' 2>/dev/null; then
      echo "  → wrote (new)"
    else
      echo "  → skipped (already exists)"
    fi
  fi
done

echo "Done."
