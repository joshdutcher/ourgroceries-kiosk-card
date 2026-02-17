#!/usr/bin/env python3
"""
Changes an item's category on OurGroceries via the API.
Updates both the master list AND the shopping list so the change
syncs immediately to other devices (Android app, etc).

Usage: python3 og_set_category.py '{"item_name":"Milk","category_name":"Dairy","list_name":"Dillon'\''s"}'
"""

import asyncio
import base64
import json
import os
import sys

CONFIG_DIR = os.environ.get("HASS_CONFIG", "/config")
CONFIG_ENTRIES = os.path.join(CONFIG_DIR, ".storage", "core.config_entries")
MASTER_CAT_FILE = os.path.join(CONFIG_DIR, "www", "og-master-categories.json")


def get_credentials():
    with open(CONFIG_ENTRIES, "r") as f:
        data = json.load(f)
    for entry in data["data"]["entries"]:
        if entry.get("domain") == "ourgroceries":
            return entry["data"]["username"], entry["data"]["password"]
    raise RuntimeError("OurGroceries integration not found in HA config")


async def set_category(item_name, category_name, list_name=""):
    import ourgroceries as og

    username, password = get_credentials()
    client = og.OurGroceries(username, password)
    await client.login()

    # Get category id -> name mapping
    cat_data = await client.get_category_items()
    cat_items = cat_data.get("list", {}).get("items", [])
    cat_map_by_name = {}
    for c in cat_items:
        cat_map_by_name[c["value"].lower()] = c["id"]

    # Find category ID
    category_id = ""
    if category_name:
        category_id = cat_map_by_name.get(category_name.lower(), "")
        if not category_id:
            print(f"Category '{category_name}' not found in OurGroceries")
            return False

    item_lower = item_name.strip().lower()

    # --- Update master list ---
    master = await client.get_master_list()
    master_items = master.get("list", {}).get("items", [])
    master_list_id = master.get("list", {}).get("id", "")

    master_item = None
    for mi in master_items:
        if mi.get("value", "").strip().lower() == item_lower:
            master_item = mi
            break

    if master_item:
        await client.change_item_on_list(
            master_list_id,
            master_item["id"],
            category_id,
            master_item["value"],
        )
        print(f"Changed '{item_name}' category to '{category_name}' on master list")
    else:
        print(f"Item '{item_name}' not found in master list (skipping master)")

    # --- Update shopping list ---
    if list_name:
        lists_data = await client.get_my_lists()
        all_lists = lists_data.get("shoppingLists", [])
        shopping_list = None
        for sl in all_lists:
            if sl.get("name", "").strip().lower() == list_name.strip().lower():
                shopping_list = sl
                break

        if shopping_list:
            list_id = shopping_list["id"]
            list_items_data = await client.get_list_items(list_id)
            list_items = list_items_data.get("list", {}).get("items", [])

            list_item = None
            for li in list_items:
                if li.get("value", "").strip().lower() == item_lower:
                    list_item = li
                    break

            if list_item:
                await client.change_item_on_list(
                    list_id,
                    list_item["id"],
                    category_id,
                    list_item["value"],
                )
                print(f"Changed '{item_name}' category to '{category_name}' on list '{list_name}'")
            else:
                print(f"Item '{item_name}' not found on list '{list_name}'")
        else:
            print(f"List '{list_name}' not found in OurGroceries")

    # Update the local master categories JSON
    try:
        if os.path.exists(MASTER_CAT_FILE):
            with open(MASTER_CAT_FILE, "r") as f:
                name_to_cat = json.load(f)
        else:
            name_to_cat = {}

        if category_name:
            name_to_cat[item_lower] = category_name
        else:
            name_to_cat.pop(item_lower, None)

        with open(MASTER_CAT_FILE, "w") as f:
            json.dump(name_to_cat, f)
        print("Updated local master categories cache")
    except Exception as e:
        print(f"Warning: failed to update local cache: {e}")

    return True


def main():
    if len(sys.argv) < 2:
        print("Usage: og_set_category.py '<json>'")
        sys.exit(1)

    raw = sys.argv[1].strip()
    if not raw or raw == "unknown":
        print("No category change data provided")
        sys.exit(0)

    # Decode base64 then parse JSON
    try:
        decoded = base64.b64decode(raw).decode("utf-8")
        data = json.loads(decoded)
    except Exception as e:
        print(f"Failed to decode input: {e}")
        sys.exit(1)

    item_name = data.get("item_name", "").strip()
    category_name = data.get("category_name", "").strip()
    list_name = data.get("list_name", "").strip()

    if not item_name:
        print("No item_name provided")
        sys.exit(1)

    asyncio.run(set_category(item_name, category_name, list_name))


if __name__ == "__main__":
    main()
