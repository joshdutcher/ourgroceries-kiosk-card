"""Async OurGroceries API client wrapper."""

import logging
from functools import wraps
from typing import Any, Callable, Coroutine

import ourgroceries as og

_LOGGER = logging.getLogger(__name__)


def _auto_reauth(func: Callable[..., Coroutine[Any, Any, Any]]):
    """Decorator that retries an API call once after re-authenticating.

    The OurGroceries session cookie can expire server-side at any time.
    When that happens, the library raises an exception (e.g. JSON decode
    error on the HTML login redirect).  This decorator catches the first
    failure, forces a fresh login, and retries the call exactly once.
    """

    @wraps(func)
    async def wrapper(self: "OurGroceriesAPI", *args, **kwargs):
        try:
            return await func(self, *args, **kwargs)
        except Exception as first_err:
            _LOGGER.debug(
                "OurGroceries call %s failed (%s), re-authenticating",
                func.__name__,
                first_err,
            )
            await self._force_relogin()
            return await func(self, *args, **kwargs)

    return wrapper


class OurGroceriesAPI:
    """Wraps the ourgroceries library with a persistent session."""

    def __init__(self, username: str, password: str) -> None:
        self._username = username
        self._password = password
        self._client: og.OurGroceries | None = None
        self._logged_in = False

    async def _ensure_login(self) -> og.OurGroceries:
        if self._client is None or not self._logged_in:
            self._client = og.OurGroceries(self._username, self._password)
            await self._client.login()
            self._logged_in = True
        return self._client

    async def _force_relogin(self) -> None:
        """Drop the current session and create a fresh one."""
        _LOGGER.info("OurGroceries: forcing fresh login")
        self._client = og.OurGroceries(self._username, self._password)
        await self._client.login()
        self._logged_in = True

    async def validate_credentials(self) -> bool:
        """Test login. Returns True on success, raises on failure."""
        client = og.OurGroceries(self._username, self._password)
        await client.login()
        self._client = client
        self._logged_in = True
        return True

    @_auto_reauth
    async def get_lists(self) -> list[dict]:
        """Return all shopping lists with name, id, and active item count."""
        client = await self._ensure_login()
        data = await client.get_my_lists()
        lists = data.get("shoppingLists", [])
        result = []
        for sl in lists:
            result.append({
                "id": sl.get("id", ""),
                "name": sl.get("name", ""),
                "item_count": sl.get("activeCount", sl.get("itemCount", 0)),
            })
        return result

    @_auto_reauth
    async def get_list_items(self, list_id: str) -> list[dict]:
        """Return items for a specific list."""
        client = await self._ensure_login()
        data = await client.get_list_items(list_id)
        items = data.get("list", {}).get("items", [])
        result = []
        for item in items:
            # The OurGroceries API no longer returns a boolean "crossedOff".
            # Instead, crossed-off items have a "crossedOffAt" timestamp.
            # Fall back to the legacy "crossedOff" field if present.
            crossed = bool(
                item.get("crossedOff")
                or item.get("crossedOffAt")
            )
            result.append({
                "id": item.get("id", ""),
                "name": item.get("value", ""),
                "crossed_off": crossed,
                "crossed_off_at": item.get("crossedOffAt", 0),
                "category_id": item.get("categoryId", ""),
                "note": item.get("note", ""),
            })
        return result

    @_auto_reauth
    async def add_item(self, list_id: str, name: str) -> None:
        """Add an item to a list."""
        client = await self._ensure_login()
        await client.add_item_to_list(list_id, name, auto_category=True)

    @_auto_reauth
    async def remove_item(self, list_id: str, item_id: str) -> None:
        """Remove an item from a list."""
        client = await self._ensure_login()
        await client.remove_item_from_list(list_id, item_id)

    @_auto_reauth
    async def update_item(
        self, list_id: str, item_id: str, name: str, category_id: str = ""
    ) -> None:
        """Rename an item (and optionally change its category)."""
        client = await self._ensure_login()
        await client.change_item_on_list(list_id, item_id, category_id, name)

    @_auto_reauth
    async def toggle_crossed_off(
        self, list_id: str, item_id: str, cross_off: bool
    ) -> None:
        """Toggle the crossed-off state of an item."""
        client = await self._ensure_login()
        await client.toggle_item_crossed_off(list_id, item_id, cross_off)

    @_auto_reauth
    async def delete_crossed_off(self, list_id: str) -> None:
        """Delete all crossed-off items from a list."""
        client = await self._ensure_login()
        await client.delete_all_crossed_off_from_list(list_id)

    @_auto_reauth
    async def get_categories(self) -> dict:
        """Return category mapping and master list item categories."""
        client = await self._ensure_login()

        # Get category id -> name mapping
        cat_data = await client.get_category_items()
        cat_items = cat_data.get("list", {}).get("items", [])
        cat_map = {c["id"]: c["value"] for c in cat_items}
        all_categories = sorted(cat_map.values(), key=str.lower)

        # Get master list for item -> category mapping
        master = await client.get_master_list()
        master_items = master.get("list", {}).get("items", [])

        master_categories = {}
        for item in master_items:
            cat_id = item.get("categoryId", "")
            if cat_id and cat_id in cat_map:
                name = item.get("value", "").strip().lower()
                if name:
                    master_categories[name] = cat_map[cat_id]

        master_item_names = [
            {"name": item.get("value", ""), "added_count": item.get("addedCount", 0)}
            for item in master_items
            if item.get("value", "").strip()
        ]

        return {
            "categories": all_categories,
            "master_categories": master_categories,
            "category_id_map": cat_map,
            "category_name_to_id": {v.lower(): k for k, v in cat_map.items()},
            "master_items": master_item_names,
        }

    @_auto_reauth
    async def get_item_list_map(self) -> dict:
        """Return a map of lowercase item names to lists they appear on.

        Only includes non-crossed-off items.
        """
        client = await self._ensure_login()
        data = await client.get_my_lists()
        lists = data.get("shoppingLists", [])

        item_map: dict[str, list[str]] = {}
        for sl in lists:
            list_id = sl.get("id", "")
            list_name = sl.get("name", "")
            if not list_id:
                continue
            list_data = await client.get_list_items(list_id)
            items = list_data.get("list", {}).get("items", [])
            for item in items:
                if item.get("crossedOff") or item.get("crossedOffAt"):
                    continue
                name = item.get("value", "").strip().lower()
                if name:
                    item_map.setdefault(name, [])
                    if list_name not in item_map[name]:
                        item_map[name].append(list_name)

        return item_map

    @_auto_reauth
    async def set_item_category(
        self,
        item_name: str,
        category_name: str,
        list_id: str = "",
    ) -> None:
        """Set category on master list and optionally on a shopping list."""
        client = await self._ensure_login()

        # Resolve category name to ID
        cat_data = await client.get_category_items()
        cat_items = cat_data.get("list", {}).get("items", [])
        cat_name_to_id = {c["value"].lower(): c["id"] for c in cat_items}

        category_id = ""
        if category_name:
            category_id = cat_name_to_id.get(category_name.lower(), "")
            if not category_id:
                _LOGGER.warning("Category '%s' not found", category_name)
                return

        item_lower = item_name.strip().lower()

        # Update master list
        master = await client.get_master_list()
        master_items = master.get("list", {}).get("items", [])
        master_list_id = master.get("list", {}).get("id", "")

        for mi in master_items:
            if mi.get("value", "").strip().lower() == item_lower:
                await client.change_item_on_list(
                    master_list_id, mi["id"], category_id, mi["value"]
                )
                break

        # Update shopping list if provided
        if list_id:
            list_data = await client.get_list_items(list_id)
            list_items = list_data.get("list", {}).get("items", [])

            for li in list_items:
                if li.get("value", "").strip().lower() == item_lower:
                    await client.change_item_on_list(
                        list_id, li["id"], category_id, li["value"]
                    )
                    break
