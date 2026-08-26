#!/usr/bin/env bash
set -euo pipefail

key_file="${WEBUI_SECRET_KEY_FILE:-/app/backend/data/.webui_secret_key}"

if [[ ! -s "${key_file}" ]]; then
  umask 077
  key_directory="$(dirname "${key_file}")"
  mkdir -p "${key_directory}"
  temporary_key="${key_file}.tmp.$$"
  head -c 32 /dev/urandom | base64 > "${temporary_key}"
  chmod 0600 "${temporary_key}"
  mv "${temporary_key}" "${key_file}"
fi

cd /app/backend
exec bash start.sh "$@"
