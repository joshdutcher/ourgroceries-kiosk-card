#!/usr/bin/env bash
set -euo pipefail

# Deploy OurGroceries Kiosk Card to Home Assistant
# Usage: ./deploy.sh [--restart]

REPO_DIR="$(cd "$(dirname "$0")" && pwd)"
HA_DIR="/var/lib/homeassistant/homeassistant"
RESOURCES_FILE="$HA_DIR/.storage/lovelace_resources"

echo "=== OurGroceries Kiosk Card Deploy ==="

# Copy card JS
echo "Copying ourgroceries-kiosk-card.js → www/"
sudo cp "$REPO_DIR/src/ourgroceries-kiosk-card.js" "$HA_DIR/www/"

# Copy Python scripts
echo "Copying og_categories.py → scripts/"
sudo cp "$REPO_DIR/src/og_categories.py" "$HA_DIR/scripts/"
echo "Copying og_set_category.py → scripts/"
sudo cp "$REPO_DIR/src/og_set_category.py" "$HA_DIR/scripts/"

# Copy HA config files
echo "Copying configuration.yaml"
sudo cp "$REPO_DIR/ha-config/configuration.yaml" "$HA_DIR/"
echo "Copying automations.yaml"
sudo cp "$REPO_DIR/ha-config/automations.yaml" "$HA_DIR/"

# Bump cache buster in lovelace_resources
if [ -f "$RESOURCES_FILE" ]; then
    # Extract current version number, increment it, write back
    sudo python3 -c "
import json, re, sys

with open('$RESOURCES_FILE', 'r') as f:
    data = json.load(f)

changed = False
for item in data.get('data', {}).get('items', []):
    url = item.get('url', '')
    m = re.search(r'\?v=(\d+)', url)
    if 'ourgroceries-kiosk-card' in url and m:
        old_v = int(m.group(1))
        new_v = old_v + 1
        item['url'] = re.sub(r'\?v=\d+', f'?v={new_v}', url)
        changed = True
        print(f'Cache buster: v={old_v} → v={new_v}')

if changed:
    with open('$RESOURCES_FILE', 'w') as f:
        json.dump(data, f, indent=2)
else:
    print('Warning: ourgroceries-kiosk-card resource not found in lovelace_resources')
"
else
    echo "Warning: $RESOURCES_FILE not found, skipping cache bust"
fi

# Restart HA if requested
if [[ "${1:-}" == "--restart" ]]; then
    echo "Restarting Home Assistant..."
    docker restart homeassistant
    echo "Waiting for HA to come up..."
    sleep 5
    echo "Done. Give HA ~60s to fully start."
else
    echo ""
    echo "Files deployed. To apply changes:"
    echo "  - Hard-refresh your browser (Ctrl+Shift+R), or"
    echo "  - Run: ./deploy.sh --restart"
fi

echo "=== Deploy complete ==="
