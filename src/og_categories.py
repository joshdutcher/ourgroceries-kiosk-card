#!/usr/bin/env python3
"""
Fetches OurGroceries master list and builds a name -> category mapping.
Writes to /config/www/og-master-categories.json for the kiosk card.
Also writes /config/www/og-all-categories.json with all category names.
Only 2 API calls regardless of how many lists you have.

Usage: python3 og_categories.py
"""

import asyncio
import json
import os

CONFIG_DIR = os.environ.get("HASS_CONFIG", "/config")
CONFIG_ENTRIES = os.path.join(CONFIG_DIR, ".storage", "core.config_entries")
OUTPUT_DIR = os.path.join(CONFIG_DIR, "www")
OUTPUT_FILE = os.path.join(OUTPUT_DIR, "og-master-categories.json")
ALL_CATS_FILE = os.path.join(OUTPUT_DIR, "og-all-categories.json")


def get_credentials():
    with open(CONFIG_ENTRIES, "r") as f:
        data = json.load(f)
    for entry in data["data"]["entries"]:
        if entry.get("domain") == "ourgroceries":
            return entry["data"]["username"], entry["data"]["password"]
    raise RuntimeError("OurGroceries integration not found in HA config")


async def fetch_master_categories():
    import ourgroceries as og

    username, password = get_credentials()
    client = og.OurGroceries(username, password)
    await client.login()

    # Get category id -> name mapping
    cat_data = await client.get_category_items()
    cat_items = cat_data.get("list", {}).get("items", [])
    cat_map = {c["id"]: c["value"] for c in cat_items}

    # Write all category names
    all_categories = sorted(cat_map.values(), key=str.lower)

    # Get master list (every item ever added)
    master = await client.get_master_list()
    items = master.get("list", {}).get("items", [])

    # Build name (lowercase) -> category name mapping
    name_to_category = {}
    for item in items:
        cat_id = item.get("categoryId", "")
        if cat_id and cat_id in cat_map:
            name = item.get("value", "").strip().lower()
            if name:
                name_to_category[name] = cat_map[cat_id]

    os.makedirs(OUTPUT_DIR, exist_ok=True)
    with open(OUTPUT_FILE, "w") as f:
        json.dump(name_to_category, f)

    with open(ALL_CATS_FILE, "w") as f:
        json.dump(all_categories, f)

    print(f"Wrote {len(name_to_category)} item->category mappings")
    print(f"Wrote {len(all_categories)} category names")


def main():
    asyncio.run(fetch_master_categories())


if __name__ == "__main__":
    main()
