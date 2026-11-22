#!/bin/bash
# Starts Trinity's helper now and every time you log in to your Mac.
set -euo pipefail

DIR="$(cd "$(dirname "$0")" && pwd)"
NODE="$(command -v node || true)"
if [ -z "$NODE" ]; then
  echo "Node.js isn't installed. Get it from https://nodejs.org (LTS), then run this again."
  exit 1
fi
if [ ! -f "$HOME/.trinity/bridge.json" ]; then
  echo "Run the setup step first: node \"$DIR/trinity-bridge.mjs\" setup <code> --vault \"/path/to/vault\""
  exit 1
fi

LABEL="com.trinity.bridge"
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"
mkdir -p "$HOME/Library/LaunchAgents" "$HOME/.trinity"

cat > "$PLIST" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>$LABEL</string>
  <key>ProgramArguments</key>
  <array>
    <string>$NODE</string>
    <string>$DIR/trinity-bridge.mjs</string>
    <string>run</string>
  </array>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>ProcessType</key><string>Background</string>
  <key>StandardOutPath</key><string>$HOME/.trinity/bridge.log</string>
  <key>StandardErrorPath</key><string>$HOME/.trinity/bridge.log</string>
</dict>
</plist>
EOF

launchctl bootout "gui/$(id -u)/$LABEL" 2>/dev/null || true
launchctl bootstrap "gui/$(id -u)" "$PLIST"
echo "Trinity's helper is running and will start at every login."
echo "Log: $HOME/.trinity/bridge.log   Stop it: launchctl bootout gui/$(id -u)/$LABEL"
