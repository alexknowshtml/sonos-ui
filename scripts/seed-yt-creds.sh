#!/usr/bin/env bash
# Seeds YouTube OAuth credentials from Andy's credential store into the
# sonos-ui SQLite KV table on the iPostal Mac.
# Run from andy/ repo root: bash /home/alexhillman/sonos-ui/scripts/seed-yt-creds.sh
set -euo pipefail

MAC="indyhall@100.88.157.74"

CRED_RAW=$(bun run scripts/get-credential.ts youtube-oauth 2>/dev/null)
CRED_JSON=$(echo "$CRED_RAW" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['token'])")

# Build a self-contained Python script with values baked in, then base64-encode for safe SSH transport
PY_SCRIPT=$(echo "$CRED_JSON" | python3 -c "
import sys, json, base64
d = json.load(sys.stdin)
tokens_json = json.dumps({'access_token':'','refresh_token':d['refresh_token'],'expires_at':0})
script = '''
import sqlite3, os
db = sqlite3.connect(os.path.expanduser('~/Sites/sonos-ui/server/state.db'))
db.executemany(
    \"INSERT OR REPLACE INTO kv (key, value, updated_at) VALUES (?, ?, unixepoch())\",
    [('yt_client_id', {cid!r}), ('yt_client_secret', {cs!r}), ('yt_tokens', {tj!r})]
)
db.commit()
db.close()
print('Seeded yt_client_id, yt_client_secret, yt_tokens OK')
'''.format(cid=d['client_id'], cs=d['client_secret'], tj=tokens_json)
print(base64.b64encode(script.encode()).decode())
")

echo "Seeding YouTube credentials to iPostal Mac..."
ssh "$MAC" "echo '$PY_SCRIPT' | base64 -d | python3"

echo ""
echo "Restart sonos-ui to pick up changes:"
echo "  ssh $MAC 'launchctl unload ~/Library/LaunchAgents/com.indyhall.sonos-ui.plist && launchctl load ~/Library/LaunchAgents/com.indyhall.sonos-ui.plist'"
