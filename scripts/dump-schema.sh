#!/usr/bin/env bash
set -euo pipefail

PROJECT="basedosdados"
OUT_JSON="basedosdados-schema.json"
OUT_MD="basedosdados-schema.md"

echo "Listing datasets in $PROJECT..."
datasets=$(bq ls --max_results=1000 "${PROJECT}:" 2>/dev/null \
  | tail -n +2 | awk '{print $1}' | tr -d ' ')

echo "{" > "$OUT_JSON"
echo "# basedosdados Schema" > "$OUT_MD"
echo "" >> "$OUT_MD"
echo "Generated: $(date -u)" >> "$OUT_MD"

first_ds=true
for ds in $datasets; do
  echo "  Dataset: $ds"
  tables=$(bq ls --max_results=10000 "${PROJECT}:${ds}" 2>/dev/null \
    | tail -n +2 | awk '{print $1}') || { echo "    [skipped - no access]"; continue; }

  [ "$first_ds" = true ] && first_ds=false || echo "," >> "$OUT_JSON"
  echo "  \"$ds\": {" >> "$OUT_JSON"
  echo "" >> "$OUT_MD"
  echo "## $ds" >> "$OUT_MD"

  first_tbl=true
  for tbl in $tables; do
    echo "    Table: $tbl"
    schema=$(bq show --schema --format=json "${PROJECT}:${ds}.${tbl}" 2>/dev/null) \
      || { echo "      [skipped - no access]"; continue; }

    [ "$first_tbl" = true ] && first_tbl=false || echo "," >> "$OUT_JSON"
    echo "    \"$tbl\": $schema" >> "$OUT_JSON"

    # Markdown: table header + columns
    echo "" >> "$OUT_MD"
    echo "### $ds.$tbl" >> "$OUT_MD"
    echo "" >> "$OUT_MD"
    echo "| Column | Type | Description |" >> "$OUT_MD"
    echo "|--------|------|-------------|" >> "$OUT_MD"
    echo "$schema" | python3 -c "
import json, sys
cols = json.load(sys.stdin)
for c in cols:
    name = c.get('name','')
    typ  = c.get('type','')
    desc = c.get('description','').replace('|',' ').replace('\n',' ')
    print(f'| {name} | {typ} | {desc} |')
" >> "$OUT_MD"
  done

  echo "" >> "$OUT_JSON"
  echo "  }" >> "$OUT_JSON"
done

echo "}" >> "$OUT_JSON"
echo ""
echo "Done. Written: $OUT_JSON  $OUT_MD"
