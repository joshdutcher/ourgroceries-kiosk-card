"""Constants for the OurGroceries Kiosk integration."""

DOMAIN = "ourgroceries_kiosk"
CONF_USERNAME = "username"
CONF_PASSWORD = "password"

# WebSocket command names
WS_GET_LISTS = f"{DOMAIN}/get_lists"
WS_GET_LIST_ITEMS = f"{DOMAIN}/get_list_items"
WS_ADD_ITEM = f"{DOMAIN}/add_item"
WS_REMOVE_ITEM = f"{DOMAIN}/remove_item"
WS_UPDATE_ITEM = f"{DOMAIN}/update_item"
WS_TOGGLE_CROSSED_OFF = f"{DOMAIN}/toggle_crossed_off"
WS_DELETE_CROSSED_OFF = f"{DOMAIN}/delete_crossed_off"
WS_GET_CATEGORIES = f"{DOMAIN}/get_categories"
WS_SET_ITEM_CATEGORY = f"{DOMAIN}/set_item_category"
WS_GET_ITEM_LIST_MAP = f"{DOMAIN}/get_item_list_map"
