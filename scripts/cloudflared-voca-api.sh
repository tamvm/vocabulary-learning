#!/usr/bin/env bash
# Add Magic English API hostname to cloudflared on the Hetzner VPS.
# Hostname: voca-api.kenchange.com → local Coolify backend (no PathPrefix strip).
# Never prints tokens, credentials JSON, or secret values.

set -euo pipefail

API_HOSTNAME="${API_HOSTNAME:-voca-api.kenchange.com}"
BACKEND_UUID="${BACKEND_UUID:-yydjqewjghoex53en4o0je43}"
SSLIP_BACKEND_HOST="${SSLIP_BACKEND_HOST:-yydjqewjghoex53en4o0je43.178.156.247.159.sslip.io}"
BACKEND_PORT="${BACKEND_PORT:-3012}"

run_root() {
  if [ "$(id -u)" = "0" ]; then
    "$@"
  elif command -v sudo >/dev/null 2>&1 && sudo -n true 2>/dev/null; then
    sudo "$@"
  else
    "$@"
  fi
}

echo "=== cloudflared diagnose ==="
echo "USER=$(whoami) HOME=$HOME"
command -v cloudflared >/dev/null 2>&1 && cloudflared --version || echo "cloudflared binary: not in PATH"
echo "processes (cmd only):"
ps -eo args= 2>/dev/null | grep -E '[c]loudflared' || echo "  (no cloudflared process)"
echo "systemd:"
systemctl is-active cloudflared 2>/dev/null || true
systemctl is-enabled cloudflared 2>/dev/null || true
echo "config/credential paths (names only):"
for d in /etc/cloudflared /home/pi/.cloudflared "${HOME}/.cloudflared" /root/.cloudflared; do
  if [ -d "$d" ]; then
    echo "  $d"
    ls -la "$d" 2>/dev/null | awk '{print "    "$1,$9}' || true
  fi
done
echo "docker name=cloudflared:"
if command -v docker >/dev/null 2>&1; then
  docker ps -a --filter name=cloudflared --format '{{.Names}} {{.Status}} {{.Image}}' || true
fi

discover_origin() {
  local cid ip code
  # 1) Coolify published host port (stable across container recreate)
  if curl -sS -o /dev/null -w '%{http_code}' --max-time 3 "http://127.0.0.1:3112/health" | grep -qx 200; then
    echo "http://127.0.0.1:3112"
    return 0
  fi
  # 2) Backend container IP:3012
  if command -v docker >/dev/null 2>&1; then
    cid="$(docker ps --format '{{.Names}}' | grep -E "^${BACKEND_UUID}" | head -n1 || true)"
    if [ -n "$cid" ]; then
      ip="$(docker inspect -f '{{range .NetworkSettings.Networks}}{{.IPAddress}} {{end}}' "$cid" | awk '{print $1}')"
      if [ -n "$ip" ]; then
        code="$(curl -sS -o /dev/null -w '%{http_code}' --max-time 3 "http://${ip}:${BACKEND_PORT}/health" || true)"
        if [ "$code" = "200" ]; then
          echo "http://${ip}:${BACKEND_PORT}"
          return 0
        fi
      fi
    fi
  fi
  # 3) Local Traefik HTTP + sslip Host (known-good /api/words → 401)
  code="$(curl -sS -o /dev/null -w '%{http_code}' --max-time 3 \
    -H "Host: ${SSLIP_BACKEND_HOST}" "http://127.0.0.1/health" || true)"
  if [ "$code" = "200" ]; then
    echo "http://127.0.0.1:80|host=${SSLIP_BACKEND_HOST}"
    return 0
  fi
  echo "http://127.0.0.1:3112"
}

ORIGIN="$(discover_origin)"
echo "origin candidate: ${ORIGIN}"

ORIGIN_URL="${ORIGIN%%|*}"
ORIGIN_HOST=""
if [[ "$ORIGIN" == *"|host="* ]]; then
  ORIGIN_HOST="${ORIGIN##*|host=}"
fi

find_config() {
  local f
  for f in \
    /etc/cloudflared/config.yml \
    /etc/cloudflared/config.yaml \
    /home/pi/.cloudflared/config.yml \
    "${HOME}/.cloudflared/config.yml" \
    /root/.cloudflared/config.yml
  do
    if [ -f "$f" ]; then
      echo "$f"
      return 0
    fi
  done
  return 1
}

merge_ingress() {
  local config_path="$1"
  python3 - "$config_path" "$API_HOSTNAME" "$ORIGIN_URL" "$ORIGIN_HOST" <<'PY'
import os, sys, tempfile
path, hostname, origin, extra_host = sys.argv[1:5]
try:
    import yaml
except ImportError:
    yaml = None

text = open(path, encoding="utf-8").read()
if hostname in text and origin in text:
    print(f"ingress already has {hostname} -> {origin}")
    raise SystemExit(0)

rule = {
    "hostname": hostname,
    "service": origin,
}
if extra_host:
    rule["originRequest"] = {"httpHostHeader": extra_host}

if yaml is not None:
    data = yaml.safe_load(text) or {}
    ingress = list(data.get("ingress") or [])
    ingress = [r for r in ingress if not (isinstance(r, dict) and r.get("hostname") == hostname)]
    catch = [r for r in ingress if isinstance(r, dict) and str(r.get("service", "")).startswith("http_status")]
    rest = [r for r in ingress if r not in catch]
    rest.append(rule)
    if not catch:
        catch = [{"service": "http_status:404"}]
    data["ingress"] = rest + catch
    fd, tmp = tempfile.mkstemp(prefix="cloudflared-", suffix=".yml")
    with os.fdopen(fd, "w", encoding="utf-8") as out:
        yaml.safe_dump(data, out, default_flow_style=False, sort_keys=False)
    print(f"wrote merged yaml {tmp}")
    print(tmp)
    raise SystemExit(0)

# Text fallback: insert before catch-all http_status
block = f"  - hostname: {hostname}\n    service: {origin}\n"
if extra_host:
    block += f"    originRequest:\n      httpHostHeader: {extra_host}\n"
marker = "- service: http_status:404"
if marker not in text:
    text = text.rstrip() + "\ningress:\n" + block + "  - service: http_status:404\n"
else:
    # drop an existing hostname block (best-effort)
    lines = text.splitlines(True)
    kept, skip = [], False
    for i, line in enumerate(lines):
        if f"hostname: {hostname}" in line:
            skip = True
            if kept and kept[-1].lstrip().startswith("- "):
                kept.pop()
            continue
        if skip:
            if line.startswith("  - ") or line.startswith("ingress:"):
                skip = False
            else:
                continue
        kept.append(line)
    text = "".join(kept)
    text = text.replace(marker, block + "  " + marker, 1)
fd, tmp = tempfile.mkstemp(prefix="cloudflared-", suffix=".yml")
with os.fdopen(fd, "w", encoding="utf-8") as out:
    out.write(text)
print(f"wrote text-merged yaml {tmp}")
print(tmp)
PY
}

CONFIG=""
if CONFIG="$(find_config)"; then
  echo "using config: $CONFIG"
  # Show hostnames only
  python3 -c '
import sys
p=sys.argv[1]
for line in open(p, encoding="utf-8"):
    if "hostname:" in line or line.strip().startswith("service:"):
        print(" ", line.rstrip())
' "$CONFIG"
  merged="$(merge_ingress "$CONFIG" | tail -n1)"
  if [ -n "$merged" ] && [ -f "$merged" ]; then
    echo "installing merged config over $CONFIG"
    run_root cp "$merged" "$CONFIG"
    rm -f "$merged"
  fi
else
  echo "No local cloudflared config.yml found (maybe a remotely-managed tunnel)."
fi

restart_cloudflared() {
  if systemctl list-unit-files 2>/dev/null | grep -q '^cloudflared.service'; then
    echo "restarting systemd cloudflared"
    run_root systemctl restart cloudflared
    systemctl is-active cloudflared || true
    return 0
  fi
  local cname
  cname="$(docker ps --format '{{.Names}}' | grep -i cloudflared | head -n1 || true)"
  if [ -n "$cname" ]; then
    echo "restarting docker $cname"
    docker restart "$cname" >/dev/null
    return 0
  fi
  echo "Could not restart cloudflared (no systemd unit / docker container)"
  return 1
}

if command -v cloudflared >/dev/null 2>&1 && [ -n "${CONFIG:-}" ]; then
  run_root cloudflared tunnel --config "$CONFIG" ingress validate || true
fi

restart_cloudflared || true

if command -v cloudflared >/dev/null 2>&1 && [ -f "${HOME}/.cloudflared/cert.pem" ]; then
  echo "cert.pem present; attempting DNS route (ignore if record exists)"
  tunnel_id="$(python3 -c '
import glob,os,re,sys
for p in glob.glob("/etc/cloudflared/*.json")+glob.glob(os.path.expanduser("~/.cloudflared/*.json")):
    name=os.path.basename(p)
    if re.match(r"[0-9a-f-]{36}\.json$", name):
        print(name[:-5]); raise SystemExit
' 2>/dev/null || true)"
  if [ -n "${tunnel_id:-}" ]; then
    echo "tunnel id (from credentials filename): ${tunnel_id}"
    cloudflared tunnel route dns "$tunnel_id" "$API_HOSTNAME" 2>&1 | sed 's/token.*/token <redacted>/g' || true
  fi
fi

echo "Done. Public hostname should be https://${API_HOSTNAME} → ${ORIGIN_URL}"
echo "Expect https://${API_HOSTNAME}/api/words without auth → 401 (not Cloudflare 404/502)."
