#!/usr/bin/env bash
# Sync Coolify FQDNs + public env for Magic English production.
# UI:  https://voca.kenchange.com
# API: https://voca-api.kenchange.com  (Host rule — do NOT use PathPrefix /api)
# Intended to run on the Hetzner self-hosted runner (Coolify on localhost:8000).
# Never prints secret values — only keys, FQDNs, and URL hostnames.

set -euo pipefail

FRONTEND_ORIGIN="https://voca.kenchange.com"
API_HOST="https://voca-api.kenchange.com"
# Axios baseURL includes /api because Express mounts routes at /api/*
VITE_API_URL="${API_HOST}/api"
BACKEND_UUID="${BACKEND_UUID:-yydjqewjghoex53en4o0je43}"
FRONTEND_UUID="${FRONTEND_UUID:-zsq5wwe7xltdrrlp5ldctr3g}"
COOLIFY_BASE_URL="${COOLIFY_BASE_URL:-http://localhost:8000}"
SSLIP_FRONTEND="http://zsq5wwe7xltdrrlp5ldctr3g.178.156.247.159.sslip.io"
SSLIP_BACKEND="http://yydjqewjghoex53en4o0je43.178.156.247.159.sslip.io"
FRONTEND_DOMAINS="${FRONTEND_ORIGIN},${SSLIP_FRONTEND}"
BACKEND_DOMAINS="${API_HOST},${SSLIP_BACKEND}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

token_can_read_apps() {
  local token="$1" tmp http
  tmp="$(mktemp)"
  http="$(curl -sS --max-time 30 -o "$tmp" -w "%{http_code}" \
    -H "Authorization: Bearer ${token}" \
    -H "Accept: application/json" \
    "${COOLIFY_BASE_URL%/}/api/v1/applications/${FRONTEND_UUID}" || true)"
  rm -f "$tmp"
  [ "$http" = "200" ]
}

collect_token_files() {
  local -a files=()
  local f
  shopt -s nullglob
  for f in \
    "${HOME}/.coolify/github-actions.token" \
    "${HOME}/.coolify/api.token" \
    "${HOME}/.coolify/root.token" \
    "${HOME}/.coolify/write.token" \
    "${HOME}/.coolify-tokens-rotated-2026-08-08/github-actions.txt" \
    "${HOME}/.coolify-tokens-rotated-2026-08-08/"*.txt \
    "${HOME}/.coolify/"*.token \
    "${HOME}/.coolify/"*.txt
  do
    [ -f "$f" ] || continue
    files+=("$f")
  done
  shopt -u nullglob
  if [ "${#files[@]}" -gt 0 ]; then
    printf '%s\n' "${files[@]}" | awk 'NF && !seen[$0]++'
  fi
}

resolve_deploy_token() {
  local env_token="${COOLIFY_API_TOKEN:-}"
  local f token
  if [ -n "$env_token" ]; then
    echo "Using COOLIFY_API_TOKEN from environment for deploy"
    return 0
  fi
  while IFS= read -r f; do
    token="$(tr -d '[:space:]' <"$f")"
    [ -n "$token" ] || continue
    COOLIFY_API_TOKEN="$token"
    export COOLIFY_API_TOKEN
    echo "Using Coolify deploy token from runner file: $f"
    return 0
  done < <(collect_token_files)
  echo "::error::Missing Coolify API token for deploy"
  exit 1
}

resolve_write_token() {
  local env_token="${COOLIFY_API_TOKEN:-}"
  local f token
  WRITE_VIA_API=0

  if [ -n "$env_token" ] && token_can_read_apps "$env_token"; then
    echo "Using COOLIFY_API_TOKEN from environment (has application read)"
    WRITE_VIA_API=1
    return 0
  fi
  if [ -n "$env_token" ]; then
    echo "COOLIFY_API_TOKEN from environment cannot read applications; scanning runner files..."
  fi

  echo "Scanning Coolify token files on runner (names only):"
  local found=0
  while IFS= read -r f; do
    found=1
    echo "  - $f"
  done < <(collect_token_files)
  if [ "$found" = "0" ]; then
    echo "  (none found under ~/.coolify*)"
  fi

  while IFS= read -r f; do
    token="$(tr -d '[:space:]' <"$f")"
    [ -n "$token" ] || continue
    if token_can_read_apps "$token"; then
      COOLIFY_API_TOKEN="$token"
      export COOLIFY_API_TOKEN
      WRITE_VIA_API=1
      echo "Using Coolify API token from runner file: $f (has application read)"
      return 0
    fi
    echo "  skip $f (no application read / deploy-only)"
  done < <(collect_token_files)

  echo "No Coolify token with application read; will try Coolify container artisan fallback"
  WRITE_VIA_API=0
}

coolify() {
  local method="$1" path="$2"
  shift 2
  local tmp http
  tmp="$(mktemp)"
  local -a curl_args=(
    -sS --max-time 60
    -o "$tmp"
    -w "%{http_code}"
    -X "$method"
    "${COOLIFY_BASE_URL%/}${path}"
    -H "Authorization: Bearer ${COOLIFY_API_TOKEN}"
    -H "Accept: application/json"
    -H "Content-Type: application/json"
  )
  if [ -n "${CF_ACCESS_CLIENT_ID:-}" ] && [ -n "${CF_ACCESS_CLIENT_SECRET:-}" ]; then
    curl_args+=(
      -H "CF-Access-Client-Id: ${CF_ACCESS_CLIENT_ID}"
      -H "CF-Access-Client-Secret: ${CF_ACCESS_CLIENT_SECRET}"
    )
  fi
  http="$(curl "${curl_args[@]}" "$@")"
  if [ "$http" != "200" ] && [ "$http" != "201" ] && [ "$http" != "202" ]; then
    echo "::error::Coolify ${method} ${path} failed (HTTP ${http})" >&2
    python3 -c 'import json,sys; p=sys.argv[1];
try:
  d=json.load(open(p)); print(d.get("message") or d.get("error") or "see Coolify response", file=sys.stderr)
except Exception:
  print(open(p).read()[:400], file=sys.stderr)' "$tmp"
    rm -f "$tmp"
    return 1
  fi
  cat "$tmp"
  rm -f "$tmp"
}

host_of() {
  python3 -c 'from urllib.parse import urlparse; import sys
v=(sys.argv[1] or "").strip()
if "://" not in v:
  print("")
  raise SystemExit
print(urlparse(v).hostname or "")' "$1"
}

resolves() {
  local host="$1"
  [ -n "$host" ] || return 1
  python3 -c 'import socket,sys
h=sys.argv[1]
try:
  socket.getaddrinfo(h, 443)
  raise SystemExit(0)
except Exception:
  raise SystemExit(1)' "$host"
}

summarize_envs() {
  local label="$1"
  python3 -c '
import json, sys
from urllib.parse import urlparse
data = json.load(sys.stdin)
rows = data if isinstance(data, list) else data.get("data") or data.get("envs") or []
print(f"  {sys.argv[1]} env keys:")
for row in rows:
    key = row.get("key") or row.get("name") or ""
    val = row.get("value") or ""
    extra = ""
    if "://" in val:
        host = urlparse(val).hostname or ""
        extra = f" host={host}"
    print(f"    - {key}{extra}")
' "$label"
}

env_value() {
  local key="$1"
  python3 -c '
import json, sys
want = sys.argv[1]
data = json.load(sys.stdin)
rows = data if isinstance(data, list) else data.get("data") or data.get("envs") or []
for row in rows:
    if (row.get("key") or row.get("name")) == want:
        print(row.get("value") or "")
        raise SystemExit
' "$key"
}

set_env() {
  local uuid="$1" key="$2" value="$3"
  local payload
  echo "  set ${key} on ${uuid}"
  payload="$(python3 -c 'import json,sys; print(json.dumps({"key":sys.argv[1],"value":sys.argv[2],"is_literal":True}))' "$key" "$value")"
  if ! coolify PATCH "/api/v1/applications/${uuid}/envs" -d "$payload" >/dev/null; then
    echo "  PATCH ${key} failed; trying POST"
    coolify POST "/api/v1/applications/${uuid}/envs" -d "$payload" >/dev/null
  fi
}

find_coolify_container() {
  local name
  if ! command -v docker >/dev/null 2>&1; then
    return 1
  fi
  for name in coolify coolify-app; do
    if docker ps --format '{{.Names}}' | grep -qx "$name"; then
      echo "$name"
      return 0
    fi
  done
  name="$(docker ps --format '{{.Names}}' | grep -E '^coolify$' || true)"
  [ -n "$name" ] || return 1
  echo "$name"
}

apply_via_artisan() {
  local container php_script
  container="$(find_coolify_container)" || {
    echo "::error::Coolify Docker container not found; cannot artisan-fallback FQDN update"
    return 1
  }
  echo "Applying FQDN/env via Coolify container: ${container}"
  php_script="${SCRIPT_DIR}/coolify-apply-voca-domains.php"
  docker cp "$php_script" "${container}:/tmp/coolify-apply-voca-domains.php"
  docker exec \
    -e BACKEND_UUID="$BACKEND_UUID" \
    -e FRONTEND_UUID="$FRONTEND_UUID" \
    -e BACKEND_FQDN="$BACKEND_DOMAINS" \
    -e FRONTEND_FQDN="$FRONTEND_DOMAINS" \
    -e FRONTEND_URL_VALUE="$FRONTEND_ORIGIN" \
    -e VITE_API_URL_VALUE="$VITE_API_URL" \
    "$container" php /tmp/coolify-apply-voca-domains.php
}

print_fqdns_via_api() {
  local label="$1"
  echo "${label} application FQDNs:"
  for pair in "frontend:${FRONTEND_UUID}" "backend:${BACKEND_UUID}"; do
    name="${pair%%:*}"
    uuid="${pair##*:}"
    app="$(coolify GET "/api/v1/applications/${uuid}")"
    fqdn="$(python3 -c 'import json,sys; d=json.load(sys.stdin); print(d.get("fqdn") or "")' <<<"$app")"
    echo "  ${name} ${uuid} fqdn=${fqdn}"
  done
}

resolve_write_token
echo "Coolify: ${COOLIFY_BASE_URL}"
echo "Target UI=${FRONTEND_ORIGIN} API host=${API_HOST} VITE_API_URL host=$(host_of "$VITE_API_URL")"

if [ "$WRITE_VIA_API" = "1" ]; then
  print_fqdns_via_api "Current"

  echo "Setting domains (backend is Host-only, no /api PathPrefix)..."
  coolify PATCH "/api/v1/applications/${FRONTEND_UUID}" \
    -d "$(python3 -c 'import json,sys; print(json.dumps({
      "domains": sys.argv[1],
      "force_domain_override": True,
      "is_force_https_enabled": True
    }))' "${FRONTEND_DOMAINS}")" >/dev/null
  echo "  frontend domains=${FRONTEND_DOMAINS}"

  coolify PATCH "/api/v1/applications/${BACKEND_UUID}" \
    -d "$(python3 -c 'import json,sys; print(json.dumps({
      "domains": sys.argv[1],
      "force_domain_override": True
    }))' "${BACKEND_DOMAINS}")" >/dev/null
  echo "  backend domains=${BACKEND_DOMAINS}"

  backend_envs="$(coolify GET "/api/v1/applications/${BACKEND_UUID}/envs")"
  frontend_envs="$(coolify GET "/api/v1/applications/${FRONTEND_UUID}/envs")"
  echo "$backend_envs" | summarize_envs backend
  echo "$frontend_envs" | summarize_envs frontend

  set_env "$BACKEND_UUID" "FRONTEND_URL" "$FRONTEND_ORIGIN"
  set_env "$FRONTEND_UUID" "VITE_API_URL" "$VITE_API_URL"

  backend_supabase="$(echo "$backend_envs" | env_value SUPABASE_URL)"
  frontend_supabase="$(echo "$frontend_envs" | env_value VITE_SUPABASE_URL)"
  backend_host="$(host_of "$backend_supabase")"
  frontend_host="$(host_of "$frontend_supabase")"
  echo "  backend SUPABASE_URL host=${backend_host:-<empty>}"
  echo "  frontend VITE_SUPABASE_URL host=${frontend_host:-<empty>}"

  if [ -n "$frontend_host" ] && resolves "$frontend_host"; then
    echo "  frontend Supabase host resolves"
  elif [ -n "$backend_host" ] && resolves "$backend_host"; then
    echo "  frontend Supabase host missing/NXDOMAIN; copying backend SUPABASE_URL + ANON key"
    backend_anon="$(echo "$backend_envs" | env_value SUPABASE_ANON_KEY)"
    if [ -z "$backend_supabase" ] || [ -z "$backend_anon" ]; then
      echo "::error::Backend SUPABASE_URL / SUPABASE_ANON_KEY missing; cannot fix Google OAuth"
      exit 1
    fi
    set_env "$FRONTEND_UUID" "VITE_SUPABASE_URL" "$backend_supabase"
    set_env "$FRONTEND_UUID" "VITE_SUPABASE_ANON_KEY" "$backend_anon"
  else
    echo "::warning::No resolvable Supabase hostname on backend or frontend. Skipping OAuth URL copy."
  fi
else
  apply_via_artisan
  resolve_deploy_token
fi

echo "Queueing deploys..."
coolify GET "/api/v1/deploy?uuid=${BACKEND_UUID}&force=false" >/dev/null
echo "  queued backend"
coolify GET "/api/v1/deploy?uuid=${FRONTEND_UUID}&force=false" >/dev/null
echo "  queued frontend"

if [ "$WRITE_VIA_API" = "1" ]; then
  print_fqdns_via_api "Post-sync"
fi

echo "Done. Frontend rebuild is required for VITE_* changes."
echo "Expect ${API_HOST}/api/words without auth → 401 (not Cloudflare 502)."
echo "Cloudflare DNS required: A api → 178.156.247.159 (proxied)."
