#!/usr/bin/env bash
# Add Magic English API hostname to the existing VPS cloudflared tunnel (n8n).
# Hostname: voca-api.kenchange.com → http://localhost:3012 (Coolify backend publish).
# Never prints tokens, credentials JSON, or secret values.

set -euo pipefail

export PATH="/home/linuxbrew/.linuxbrew/bin:/home/linuxbrew/.linuxbrew/sbin:${PATH}"

API_HOSTNAME="${API_HOSTNAME:-voca-api.kenchange.com}"
BACKEND_PORT="${BACKEND_PORT:-3012}"
CONFIG_PATH="${CLOUDFLARED_CONFIG:-/home/pi/.cloudflared/config.yml}"
TUNNEL_NAME="${CLOUDFLARED_TUNNEL_NAME:-n8n}"

CLOUDFLARED="$(command -v cloudflared || true)"
if [ -z "$CLOUDFLARED" ] && [ -x /home/linuxbrew/.linuxbrew/bin/cloudflared ]; then
  CLOUDFLARED=/home/linuxbrew/.linuxbrew/bin/cloudflared
fi

echo "=== cloudflared diagnose ==="
echo "USER=$(whoami) HOME=$HOME cloudflared=${CLOUDFLARED:-missing}"
[ -n "$CLOUDFLARED" ] && "$CLOUDFLARED" --version || echo "cloudflared binary: not found"
echo "processes:"
ps -eo pid=,args= 2>/dev/null | grep -E '[c]loudflared' | grep -v 'cloudflared-voca-api' || echo "  (no cloudflared process)"
echo "brew services (informational; not used to restart):"
command -v brew >/dev/null 2>&1 && brew services list 2>/dev/null | grep -i cloudflare || echo "  (none)"
echo "user systemd:"
systemctl --user is-active cloudflared 2>/dev/null || true

discover_origin() {
  local code
  # Coolify publishes the backend on loopback (wiki-api style).
  code="$(curl -sS -o /dev/null -w '%{http_code}' --max-time 3 "http://127.0.0.1:${BACKEND_PORT}/health" || true)"
  if [ "$code" = "200" ]; then
    echo "http://localhost:${BACKEND_PORT}"
    return 0
  fi
  echo "::error::Backend health failed on 127.0.0.1:${BACKEND_PORT} (HTTP ${code:-none})" >&2
  echo "http://localhost:${BACKEND_PORT}"
}

ORIGIN_URL="$(discover_origin)"
echo "origin: ${ORIGIN_URL}"

if [ ! -f "$CONFIG_PATH" ]; then
  echo "::error::Missing ${CONFIG_PATH}"
  exit 1
fi

echo "config hostnames before:"
grep -E 'hostname:|service:' "$CONFIG_PATH" | sed 's/^/  /'

cp -a "$CONFIG_PATH" "${CONFIG_PATH}.bak-voca-api-$(date +%Y%m%d%H%M%S)"

python3 - "$CONFIG_PATH" "$API_HOSTNAME" "$ORIGIN_URL" <<'PY'
import pathlib, re, sys
path, hostname, origin = sys.argv[1:4]
text = pathlib.Path(path).read_text(encoding="utf-8")
pat = re.compile(
    r"(-\s*hostname:\s*" + re.escape(hostname) + r"\s*\n\s*service:\s*)\S+",
)
if pat.search(text):
    text = pat.sub(r"\1" + origin, text, count=1)
    pathlib.Path(path).write_text(text, encoding="utf-8")
    print(f"updated existing {hostname} -> {origin}")
else:
    block = f"  - hostname: {hostname}\n    service: {origin}\n"
    marker = "- service: http_status:404"
    if marker in text:
        text = text.replace(marker, block.rstrip("\n") + "\n  " + marker, 1)
    else:
        if "ingress:" not in text:
            text += "\ningress:\n"
        text = text.rstrip() + "\n" + block + "  - service: http_status:404\n"
    pathlib.Path(path).write_text(text, encoding="utf-8")
    print(f"inserted {hostname} -> {origin}")
PY

echo "config hostnames after:"
grep -E 'hostname:|service:' "$CONFIG_PATH" | sed 's/^/  /'

tunnel_pids() {
  # Match both `cloudflared tunnel run n8n` and `cloudflared tunnel --config … run n8n`.
  pgrep -f '[c]loudflared .*tunnel' || true
}

start_tunnel() {
  if [ -z "$CLOUDFLARED" ]; then
    echo "::error::cloudflared binary not found" >&2
    return 1
  fi
  echo "starting ${CLOUDFLARED} tunnel --config ${CONFIG_PATH} run ${TUNNEL_NAME}"
  # setsid: leave the Actions process group so the runner does not kill the tunnel
  # when the job ends. nohup/disown alone is not enough on self-hosted GHA.
  mkdir -p "${HOME}/.cloudflared"
  nohup setsid "$CLOUDFLARED" tunnel --config "$CONFIG_PATH" run "$TUNNEL_NAME" \
    >>"${HOME}/.cloudflared/voca-api-tunnel.log" 2>&1 < /dev/null &
  disown || true
}

restart_cloudflared() {
  local pids
  # This host runs a user process (`cloudflared tunnel run n8n`), not systemd.
  # brew services / systemctl --user fail in GitHub Actions ("Failed to connect to bus").
  # Do not use brew even when `brew services list` shows `cloudflared none`.
  pids="$(tunnel_pids)"
  if [ -n "$pids" ]; then
    echo "stopping cloudflared pids: ${pids}"
    # shellcheck disable=SC2086
    kill $pids || true
    sleep 2
    pids="$(tunnel_pids)"
    if [ -n "$pids" ]; then
      echo "force-stopping leftover pids: ${pids}"
      # shellcheck disable=SC2086
      kill -9 $pids 2>/dev/null || true
      sleep 1
    fi
  fi
  start_tunnel
  sleep 3
  pids="$(tunnel_pids)"
  if [ -z "$pids" ]; then
    echo "::error::cloudflared failed to start" >&2
    tail -50 "${HOME}/.cloudflared/voca-api-tunnel.log" >&2 || true
    return 1
  fi
  echo "cloudflared running pids: ${pids}"
}

echo "=== ensuring tunnel DNS route ==="
if [ -n "$CLOUDFLARED" ] && [ -f "${HOME}/.cloudflared/cert.pem" ]; then
  # Idempotent: ok if the hostname is already routed to this tunnel.
  if ! "$CLOUDFLARED" tunnel route dns "$TUNNEL_NAME" "$API_HOSTNAME" >/tmp/cf-route-dns.log 2>&1; then
    echo "tunnel route dns skipped (already exists or not needed)"
    grep -viE 'token|secret|credential' /tmp/cf-route-dns.log || true
  else
    echo "tunnel route dns ok for ${API_HOSTNAME}"
  fi
else
  echo "skip tunnel route dns (missing cert.pem or cloudflared)"
fi

echo "=== restarting tunnel process ==="
restart_cloudflared

echo "=== local origin smoke ==="
curl -sS -o /tmp/voca-api-local-health.txt -w "localhost:${BACKEND_PORT}/health HTTP %{http_code}\n" \
  --max-time 5 "http://127.0.0.1:${BACKEND_PORT}/health" || true
curl -sS -o /tmp/voca-api-local-words.txt -w "localhost:${BACKEND_PORT}/api/words HTTP %{http_code}\n" \
  --max-time 5 "http://127.0.0.1:${BACKEND_PORT}/api/words" || true

echo "Done. Expect https://${API_HOSTNAME}/api/words → 401."
