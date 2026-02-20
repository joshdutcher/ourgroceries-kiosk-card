"""OurGroceries Kiosk — HACS integration for managing OurGroceries lists."""

import logging
import os

import voluptuous as vol
from homeassistant.components import websocket_api
from homeassistant.components.http import StaticPathConfig
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant

from .api import OurGroceriesAPI
from .const import (
    CONF_PASSWORD,
    CONF_USERNAME,
    DOMAIN,
    WS_ADD_ITEM,
    WS_DELETE_CROSSED_OFF,
    WS_GET_CATEGORIES,
    WS_GET_ITEM_LIST_MAP,
    WS_GET_LIST_ITEMS,
    WS_GET_LISTS,
    WS_REMOVE_ITEM,
    WS_SET_ITEM_CATEGORY,
    WS_TOGGLE_CROSSED_OFF,
    WS_UPDATE_ITEM,
)

_LOGGER = logging.getLogger(__name__)

FRONTEND_DIR = os.path.join(os.path.dirname(__file__), "frontend")
CARD_URL = f"/{DOMAIN}/ourgroceries-kiosk-card.js"


async def async_setup_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    """Set up OurGroceries Kiosk from a config entry."""
    api = OurGroceriesAPI(
        entry.data[CONF_USERNAME], entry.data[CONF_PASSWORD]
    )

    # Validate credentials on setup
    try:
        await api.validate_credentials()
    except Exception:
        _LOGGER.error("Failed to authenticate with OurGroceries")
        return False

    hass.data.setdefault(DOMAIN, {})
    hass.data[DOMAIN][entry.entry_id] = api

    # Register the frontend card as a static resource
    await hass.http.async_register_static_paths(
        [StaticPathConfig(
            CARD_URL,
            os.path.join(FRONTEND_DIR, "ourgroceries-kiosk-card.js"),
            cache_headers=False,
        )]
    )

    # Register as a Lovelace resource so users don't have to manually add it
    await _async_register_lovelace_resource(hass)

    # Register WebSocket handlers
    _register_websocket_handlers(hass)

    return True


async def async_unload_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    """Unload a config entry."""
    hass.data[DOMAIN].pop(entry.entry_id, None)
    return True


async def _async_register_lovelace_resource(hass: HomeAssistant) -> None:
    """Register the card JS as a Lovelace resource if not already present."""
    url = CARD_URL
    # Use the lovelace resources collection if available
    try:
        resources = hass.data.get("lovelace", {})
        if hasattr(resources, "resources"):
            res_collection = resources.resources
            # Check if already registered
            for item in res_collection.async_items():
                if url in item.get("url", ""):
                    return
            await res_collection.async_create_item(
                {"url": url, "res_type": "module"}
            )
            _LOGGER.info("Registered Lovelace resource: %s", url)
            return
    except Exception:
        pass

    # Fallback: add as extra module URL for the frontend
    hass.data.setdefault("frontend_extra_module_url", set())
    if url not in hass.data["frontend_extra_module_url"]:
        hass.data["frontend_extra_module_url"].add(url)


def _get_api(hass: HomeAssistant) -> OurGroceriesAPI:
    """Get the first available API instance."""
    apis = hass.data.get(DOMAIN, {})
    if not apis:
        raise ValueError("OurGroceries Kiosk integration not configured")
    return next(iter(apis.values()))


def _register_websocket_handlers(hass: HomeAssistant) -> None:
    """Register all WebSocket command handlers."""

    @websocket_api.websocket_command({vol.Required("type"): WS_GET_LISTS})
    @websocket_api.async_response
    async def ws_get_lists(hass, connection, msg):
        api = _get_api(hass)
        try:
            lists = await api.get_lists()
            connection.send_result(msg["id"], {"lists": lists})
        except Exception as err:
            connection.send_error(msg["id"], "get_lists_failed", str(err))

    @websocket_api.websocket_command(
        {
            vol.Required("type"): WS_GET_LIST_ITEMS,
            vol.Required("list_id"): str,
        }
    )
    @websocket_api.async_response
    async def ws_get_list_items(hass, connection, msg):
        api = _get_api(hass)
        try:
            items = await api.get_list_items(msg["list_id"])
            connection.send_result(msg["id"], {"items": items})
        except Exception as err:
            connection.send_error(msg["id"], "get_list_items_failed", str(err))

    @websocket_api.websocket_command(
        {
            vol.Required("type"): WS_ADD_ITEM,
            vol.Required("list_id"): str,
            vol.Required("name"): str,
        }
    )
    @websocket_api.async_response
    async def ws_add_item(hass, connection, msg):
        api = _get_api(hass)
        try:
            await api.add_item(msg["list_id"], msg["name"])
            connection.send_result(msg["id"], {"success": True})
        except Exception as err:
            connection.send_error(msg["id"], "add_item_failed", str(err))

    @websocket_api.websocket_command(
        {
            vol.Required("type"): WS_REMOVE_ITEM,
            vol.Required("list_id"): str,
            vol.Required("item_id"): str,
        }
    )
    @websocket_api.async_response
    async def ws_remove_item(hass, connection, msg):
        api = _get_api(hass)
        try:
            await api.remove_item(msg["list_id"], msg["item_id"])
            connection.send_result(msg["id"], {"success": True})
        except Exception as err:
            connection.send_error(msg["id"], "remove_item_failed", str(err))

    @websocket_api.websocket_command(
        {
            vol.Required("type"): WS_UPDATE_ITEM,
            vol.Required("list_id"): str,
            vol.Required("item_id"): str,
            vol.Required("name"): str,
            vol.Optional("category_id", default=""): str,
        }
    )
    @websocket_api.async_response
    async def ws_update_item(hass, connection, msg):
        api = _get_api(hass)
        try:
            await api.update_item(
                msg["list_id"], msg["item_id"], msg["name"],
                msg.get("category_id", "")
            )
            connection.send_result(msg["id"], {"success": True})
        except Exception as err:
            connection.send_error(msg["id"], "update_item_failed", str(err))

    @websocket_api.websocket_command(
        {
            vol.Required("type"): WS_TOGGLE_CROSSED_OFF,
            vol.Required("list_id"): str,
            vol.Required("item_id"): str,
            vol.Required("cross_off"): bool,
        }
    )
    @websocket_api.async_response
    async def ws_toggle_crossed_off(hass, connection, msg):
        api = _get_api(hass)
        try:
            await api.toggle_crossed_off(
                msg["list_id"], msg["item_id"], msg["cross_off"]
            )
            connection.send_result(msg["id"], {"success": True})
        except Exception as err:
            connection.send_error(
                msg["id"], "toggle_crossed_off_failed", str(err)
            )

    @websocket_api.websocket_command(
        {
            vol.Required("type"): WS_DELETE_CROSSED_OFF,
            vol.Required("list_id"): str,
        }
    )
    @websocket_api.async_response
    async def ws_delete_crossed_off(hass, connection, msg):
        api = _get_api(hass)
        try:
            await api.delete_crossed_off(msg["list_id"])
            connection.send_result(msg["id"], {"success": True})
        except Exception as err:
            connection.send_error(
                msg["id"], "delete_crossed_off_failed", str(err)
            )

    @websocket_api.websocket_command({vol.Required("type"): WS_GET_CATEGORIES})
    @websocket_api.async_response
    async def ws_get_categories(hass, connection, msg):
        api = _get_api(hass)
        try:
            data = await api.get_categories()
            connection.send_result(msg["id"], data)
        except Exception as err:
            connection.send_error(
                msg["id"], "get_categories_failed", str(err)
            )

    @websocket_api.websocket_command(
        {
            vol.Required("type"): WS_SET_ITEM_CATEGORY,
            vol.Required("item_name"): str,
            vol.Required("category_name"): str,
            vol.Optional("list_id", default=""): str,
        }
    )
    @websocket_api.async_response
    async def ws_set_item_category(hass, connection, msg):
        api = _get_api(hass)
        try:
            await api.set_item_category(
                msg["item_name"],
                msg["category_name"],
                msg.get("list_id", ""),
            )
            connection.send_result(msg["id"], {"success": True})
        except Exception as err:
            connection.send_error(
                msg["id"], "set_item_category_failed", str(err)
            )

    @websocket_api.websocket_command({vol.Required("type"): WS_GET_ITEM_LIST_MAP})
    @websocket_api.async_response
    async def ws_get_item_list_map(hass, connection, msg):
        api = _get_api(hass)
        try:
            data = await api.get_item_list_map()
            connection.send_result(msg["id"], data)
        except Exception as err:
            connection.send_error(
                msg["id"], "get_item_list_map_failed", str(err)
            )

    # Register all handlers
    websocket_api.async_register_command(hass, ws_get_lists)
    websocket_api.async_register_command(hass, ws_get_list_items)
    websocket_api.async_register_command(hass, ws_add_item)
    websocket_api.async_register_command(hass, ws_remove_item)
    websocket_api.async_register_command(hass, ws_update_item)
    websocket_api.async_register_command(hass, ws_toggle_crossed_off)
    websocket_api.async_register_command(hass, ws_delete_crossed_off)
    websocket_api.async_register_command(hass, ws_get_categories)
    websocket_api.async_register_command(hass, ws_set_item_category)
    websocket_api.async_register_command(hass, ws_get_item_list_map)
