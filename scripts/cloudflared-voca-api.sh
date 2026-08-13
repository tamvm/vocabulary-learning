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

echo "=== cloudflared diagnose ==="
echo "USER=$(whoami) HOME=$HOME PATH_has_brew=$(command -v cloudflared || true)"
command -v cloudflared >/dev/null 2>&1 && cloudflared --version || echo "cloudflared binary: not in PATH"
echo "processes:"
ps -eo pid=,args= 2>/dev/null | grep -E '[c]loudflared' || echo "  (no cloudflared process)"
echo "brew services:"
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

restart_cloudflared() {
  local pid args
  if command -v brew >/dev/null 2>&1 && brew services list 2>/dev/null | grep -qi cloudflared; then
    echo "brew services restart cloudflared"
    brew services restart cloudflared
    return 0
  fi
  if systemctl --user list-unit-files 2>/dev/null | grep -q cloudflared; then
    echo "systemctl --user restart cloudflared"
    systemctl --user restart cloudflared
    return 0
  fi
  pid="$(pgrep -f 'cloudflared tunnel run' | head -n1 || true)"
  if [ -z "$pid" ]; then
    echo "starting cloudflared tunnel run ${TUNNEL_NAME}"
    nohup cloudflared tunnel --config "$CONFIG_PATH" run "$TUNNEL_NAME" \
      >>"${HOME}/.cloudflared/voca-api-tunnel.log" 2>&1 &
    disown || true
    sleep 2
    pgrep -f 'cloudflared tunnel run' >/dev/null
    return 0
  fi
  args="$(ps -o args= -p "$pid")"
  echo "restarting cloudflared pid=${pid} (args redacted to binary + tunnel run)"
  echo "  $(echo "$args" | awk '{print $1, $2, $3, $4}')"
  kill "$pid" || true
  sleep 2
  if pgrep -f 'cloudflared tunnel run' >/dev/null; then
    echo "process respawned by supervisor"
    return 0
  fi
  nohup cloudflared tunnel --config "$CONFIG_PATH" run "$TUNNEL_NAME" \
    >>"${HOME}/.cloudflared/voca-api-tunnel.log" 2>&1 &
  disown || true
  sleep 2
  pgrep -f 'cloudflared tunnel run' >/dev/null
}

restart_cloudflared

if [ -f "${HOME}/.cloudflared/cert.pem" ] && command -v cloudflared >/dev/null 2>&1; then
  echo "routing DNS ${API_HOSTNAME} via tunnel ${TUNNEL_NAME} (ok if record exists)"
  cloudflared tunnel route dns "$TUNNEL_NAME" "$API_HOSTNAME" 2>&1 | grep -v -i token || true
fi

echo "Done. Expect https://${API_HOSTNAME}/api/words → 401."
