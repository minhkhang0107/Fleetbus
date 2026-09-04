#!/usr/bin/env bash
parent_path=$( cd "$(dirname "${BASH_SOURCE[0]:-$0}")" && pwd -P )
root_project_path=$(dirname "$parent_path")
env_path="$root_project_path/env/$1.env"

dart_define=""
if [ -f "$env_path" ]; then
  while IFS= read -r line || [ -n "$line" ]; do
    # Skip comments and empty lines
    if [[ $line =~ ^[A-Za-z_][A-Za-z0-9_]*=.*$ ]]; then
      dart_define+="--dart-define $line "
    fi
  done < "$env_path"
fi

cd "$root_project_path/app" || exit 1
# $1: develop / qa / staging / production
# $2: build / run
# $3 (optional): apk / appbundle / ios / ipa
# $4 (optional): flags like --export-options-plist=...
cmd="flutter $2 $3 $4 -t lib/main.dart --flavor $1 $dart_define"
echo "Executing: $cmd"
eval "$cmd"
