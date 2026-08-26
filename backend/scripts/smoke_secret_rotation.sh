#!/usr/bin/env bash
set -euo pipefail

project="oj-secret-rotation-e2e"
repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
fixture_root="$(mktemp -d /tmp/oj-secret-rotation.XXXXXX)"
old_dir="$fixture_root/old"
new_dir="$fixture_root/new"
active_dir="$fixture_root/active"
mkdir -p "$old_dir" "$new_dir" "$active_dir"

compose_files=(
  -f "$repo_root/docker-compose.yml"
  -f "$repo_root/docker-compose.secrets.yml"
  -f "$repo_root/docker-compose.rotation-smoke.yml"
)
secret_names=(
  secret_key encryption_key database_url postgres_password minio_root_user
  minio_root_password
)

compose() {
  env \
    CORS_ORIGINS=https://rotation.invalid \
    OJ_SECRET_DIR="$active_dir" \
    POSTGRES_PASSWORD=unused-compose-interpolation \
    MINIO_ROOT_PASSWORD=unused-compose-interpolation \
    docker compose -p "$project" "${compose_files[@]}" "$@"
}

copy_credentials() {
  local source_dir="$1"
  shift
  local name
  for name in "$@"; do
    install -m 600 "$source_dir/$name" "$active_dir/$name"
  done
}

client() {
  docker run --rm \
    --network "${project}_oj-network" \
    --mount "type=bind,src=$old_dir,dst=/run/old,readonly" \
    --mount "type=bind,src=$new_dir,dst=/run/new,readonly" \
    oj-api python -m scripts.smoke_secret_rotation "$@"
}

cleanup() {
  compose down -v --remove-orphans >/dev/null 2>&1 || true
  case "$fixture_root" in
    /tmp/oj-secret-rotation.*) rm -r "$fixture_root" ;;
    *) echo "Refusing to remove unexpected path: $fixture_root" >&2 ;;
  esac
}
trap cleanup EXIT

for directory in "$old_dir" "$new_dir"; do
  for name in "${secret_names[@]}"; do
    openssl rand -out "$directory/$name" -hex 32
    chmod 600 "$directory/$name"
  done
done
copy_credentials "$old_dir" "${secret_names[@]}"

compose up -d --wait db minio
client minio-put /run/old
client db-rotate /run/old /run/new

copy_credentials "$new_dir" postgres_password minio_root_user minio_root_password
compose up -d --wait --force-recreate db minio
client db-verify /run/new
client db-rejected /run/old
client minio-verify /run/new
client minio-rejected /run/old

# Roll back credentials while preserving the marker data.
client db-rotate /run/new /run/old
copy_credentials "$old_dir" postgres_password minio_root_user minio_root_password
compose up -d --wait --force-recreate db minio
client db-verify /run/old
client db-rejected /run/new
client minio-verify /run/old
client minio-rejected /run/new

echo '{"status":"AC","postgres":"rotate+reject-old+rollback","minio":"rotate+reject-old+rollback","data":"preserved"}'
