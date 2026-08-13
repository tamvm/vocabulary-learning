#!/usr/bin/env bash
# Sync Coolify FQDNs + public env for https://voca.kenchange.com
# Intended to run on the Hetzner self-hosted runner (Coolify on localhost:8000).
# Never prints secret values — only keys, FQDNs, and URL hostnames.

set -euo pipefail

FRONTEND_ORIGIN="https://voca.kenchange.com"
API_ORIGIN="${FRONTEND_ORIGIN}/api"
BACKEND_UUID="${BACKEND_UUID:-yydjqewjghoex53en4o0je43}"
FRONTEND_UUID="${FRONTEND_UUID:-zsq5wwe7xltdrrlp5ldctr3g}"
COOLIFY_BASE_URL="${COOLIFY_BASE_URL:-http://localhost:8000}"
SSLIP_FRONTEND="http://zsq5wwe7xltdrrlp5ldctr3g.178.156.247.159.sslip.io"
SSLIP_BACKEND="http://yydjqewjghoex53en4o0je43.178.156.247.159.sslip.io"

resolve_token() {
  if [ -n "${COOLIFY_API_TOKEN:-}" ]; then
    echo "Using COOLIFY_API_TOKEN from environment"
    return 0
  fi
  local candidates=(
    "${HOME}/.coolify/github-actions.token"
    "${HOME}/.coolify-tokens-rotated-2026-08-08/github-actions.txt"
  )
  local f
  for f in "${candidates[@]}"; do
    if [ -f "$f" ]; then
      COOLIFY_API_TOKEN="$(tr -d '[:space:]' <"$f")"
      export COOLIFY_API_TOKEN
      echo "Using Coolify API token from runner file: $f"
      return 0
    fi
  done
  echo "::error::Missing Coolify API token"
  exit 1
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

resolve_token
echo "Coolify: ${COOLIFY_BASE_URL}"

echo "Current application FQDNs:"
for pair in "frontend:${FRONTEND_UUID}" "backend:${BACKEND_UUID}"; do
  name="${pair%%:*}"
  uuid="${pair##*:}"
  app="$(coolify GET "/api/v1/applications/${uuid}")"
  fqdn="$(python3 -c 'import json,sys; d=json.load(sys.stdin); print(d.get("fqdn") or "")' <<<"$app")"
  echo "  ${name} ${uuid} fqdn=${fqdn}"
done

echo "Setting domains..."
coolify PATCH "/api/v1/applications/${FRONTEND_UUID}" \
  -d "$(python3 -c 'import json,sys; print(json.dumps({
    "domains": sys.argv[1],
    "force_domain_override": True,
    "is_force_https_enabled": True
  }))' "${FRONTEND_ORIGIN},${SSLIP_FRONTEND}")" >/dev/null
echo "  frontend domains=${FRONTEND_ORIGIN},${SSLIP_FRONTEND}"

coolify PATCH "/api/v1/applications/${BACKEND_UUID}" \
  -d "$(python3 -c 'import json,sys; print(json.dumps({
    "domains": sys.argv[1],
    "force_domain_override": True
  }))' "${API_ORIGIN},${SSLIP_BACKEND}")" >/dev/null
echo "  backend domains=${API_ORIGIN},${SSLIP_BACKEND}"

backend_envs="$(coolify GET "/api/v1/applications/${BACKEND_UUID}/envs")"
frontend_envs="$(coolify GET "/api/v1/applications/${FRONTEND_UUID}/envs")"
echo "$backend_envs" | summarize_envs backend
echo "$frontend_envs" | summarize_envs frontend

set_env "$BACKEND_UUID" "FRONTEND_URL" "$FRONTEND_ORIGIN"
set_env "$FRONTEND_UUID" "VITE_API_URL" "$API_ORIGIN"

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
  echo "::error::No resolvable Supabase hostname on backend or frontend. Google OAuth will stay broken until SUPABASE_URL is a live project."
  exit 1
fi

echo "Queueing deploys..."
coolify GET "/api/v1/deploy?uuid=${BACKEND_UUID}&force=false" >/dev/null
echo "  queued backend"
coolify GET "/api/v1/deploy?uuid=${FRONTEND_UUID}&force=false" >/dev/null
echo "  queued frontend"
echo "Done. Frontend rebuild is required for VITE_* changes."
