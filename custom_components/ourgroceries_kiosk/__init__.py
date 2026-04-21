"""OurGroceries Kiosk — HACS integration for managing OurGroceries lists."""

import hashlib
import logging
import os
import re

import voluptuous as vol
from aiohttp import web
from homeassistant.components import websocket_api
from homeassistant.components.http import HomeAssistantView, StaticPathConfig
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
    WS_UPDATE_ITEM_NOTE,
)

_LOGGER = logging.getLogger(__name__)

FRONTEND_DIR = os.path.join(os.path.dirname(__file__), "frontend")
CARD_JS_PATH = os.path.join(FRONTEND_DIR, "ourgroceries-kiosk-card.js")
CARD_URL = f"/{DOMAIN}/ourgroceries-kiosk-card.js"


def _js_cache_hash() -> str:
    """Return a short hash of the JS file for cache busting."""
    try:
        with open(CARD_JS_PATH, "rb") as f:
            return hashlib.md5(f.read()).hexdigest()[:8]
    except OSError:
        return "0"


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
            CARD_JS_PATH,
            cache_headers=False,
        )]
    )

    # Register as a Lovelace resource with cache-busting hash
    card_url_versioned = f"{CARD_URL}?v={_js_cache_hash()}"
    await _async_register_lovelace_resource(hass, card_url_versioned)

    # Register WebSocket handlers
    _register_websocket_handlers(hass)

    # Register photo proxy endpoint
    hass.http.register_view(OurGroceriesPhotoView())

    return True


async def async_unload_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    """Unload a config entry."""
    hass.data[DOMAIN].pop(entry.entry_id, None)
    return True


async def _async_register_lovelace_resource(
    hass: HomeAssistant, versioned_url: str
) -> None:
    """Register the card JS as a Lovelace resource."""
    try:
        resources = hass.data.get("lovelace", {})
        if hasattr(resources, "resources"):
            res_collection = resources.resources
            for item in res_collection.async_items():
                item_url = item.get("url", "")
                if CARD_URL in item_url:
                    if item_url != versioned_url:
                        await res_collection.async_update_item(
                            item["id"], {"url": versioned_url}
                        )
                        _LOGGER.info("Updated Lovelace resource: %s", versioned_url)
                    return
            await res_collection.async_create_item(
                {"url": versioned_url, "res_type": "module"}
            )
            _LOGGER.info("Registered Lovelace resource: %s", versioned_url)
            return
    except Exception:
        pass

    hass.data.setdefault("frontend_extra_module_url", set())
    for existing in list(hass.data["frontend_extra_module_url"]):
        if CARD_URL in existing:
            hass.data["frontend_extra_module_url"].discard(existing)
    hass.data["frontend_extra_module_url"].add(versioned_url)


class OurGroceriesPhotoView(HomeAssistantView):
    """Proxy OurGroceries item photos through HA."""

    url = "/api/ourgroceries_kiosk/photo/{photo_id}"
    name = "api:ourgroceries_kiosk:photo"
    requires_auth = False

    _PHOTO_ID_RE = re.compile(r"^[A-Za-z0-9_-]+$")

    async def get(self, request: web.Request, photo_id: str) -> web.Response:
        if not self._PHOTO_ID_RE.match(photo_id):
            return web.Response(status=400, text="Invalid photo ID")
        hass = request.app["hass"]
        api = _get_api(hass)
        try:
            data, content_type = await api.fetch_photo(photo_id)
            return web.Response(
                body=data,
                content_type=content_type,
                headers={"Cache-Control": "public, max-age=86400"},
            )
        except Exception:
            return web.Response(status=404, text="Photo not found")


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

    @websocket_api.websocket_command(
        {
            vol.Required("type"): WS_UPDATE_ITEM_NOTE,
            vol.Required("list_id"): str,
            vol.Required("item_id"): str,
            vol.Required("item_name"): str,
            vol.Required("note"): str,
        }
    )
    @websocket_api.async_response
    async def ws_update_item_note(hass, connection, msg):
        api = _get_api(hass)
        try:
            await api.update_item_note(
                msg["list_id"],
                msg["item_id"],
                msg["item_name"],
                msg["note"],
            )
            connection.send_result(msg["id"], {"success": True})
        except Exception as err:
            connection.send_error(
                msg["id"], "update_item_note_failed", str(err)
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
    websocket_api.async_register_command(hass, ws_update_item_note)
