#!/bin/bash
set -e

MAC="indyhall@100.88.157.74"
REMOTE_DIR="~/Sites/sonos-ui"

echo "Building..."
bun run build

echo "Deploying to clubhouse Mac..."
ssh "$MAC" "mkdir -p $REMOTE_DIR/server/public"

# Sync server files (excluding node_modules and public — those deploy separately)
rsync -az --exclude='node_modules' --exclude='public' server/ "$MAC:$REMOTE_DIR/server/"

# Sync built frontend
rsync -az server/public/ "$MAC:$REMOTE_DIR/server/public/"

# Sync package files
rsync -az package.json bun.lock "$MAC:$REMOTE_DIR/" 2>/dev/null || true

# Sync launchd plist
scp com.indyhall.sonos-ui.plist "$MAC:~/Library/LaunchAgents/com.indyhall.sonos-ui.plist"

echo "Installing dependencies on Mac..."
ssh "$MAC" "cd $REMOTE_DIR && ~/.bun/bin/bun install --production 2>/dev/null || true"

echo "Restarting launchd service..."
ssh "$MAC" "launchctl unload ~/Library/LaunchAgents/com.indyhall.sonos-ui.plist 2>/dev/null || true && launchctl load ~/Library/LaunchAgents/com.indyhall.sonos-ui.plist"

echo "Done. Access at http://sonos.indyhall.org:2650"
