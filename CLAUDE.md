# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Plans and Documents

All plans, notes, and documents created during development sessions must be saved to `.claude/` in this repository — not to `~/.claude/` or any other location.

## What This Is

A HACS integration for Home Assistant that provides a touch-friendly Lovelace card for managing OurGroceries shopping lists on a wall tablet. One install, no YAML, no shell commands.

## No Build Step

The JavaScript card is vanilla JS / Web Components / Shadow DOM. Edit `frontend/ourgroceries-kiosk-card.js` directly — no bundler, no transpilation.

## Deployment for Testing

Copy the integration into your HA instance and restart:

```bash
sudo cp -r custom_components/ourgroceries_kiosk /var/lib/homeassistant/homeassistant/custom_components/
sudo systemctl restart homeassistant  # or docker restart homeassistant
```

After editing only the JS card (no Python changes), a hard browser refresh (`Ctrl+Shift+R`) is usually sufficient — no HA restart needed.

## Architecture

### Two-Layer Structure

**Python backend** (`custom_components/ourgroceries_kiosk/`): A standard HA integration that wraps the `ourgroceries` PyPI library. Credentials are stored in a HA config entry (entered via config flow). The integration serves the card JS as a static resource and registers custom WebSocket command handlers.

**JavaScript frontend** (`frontend/ourgroceries-kiosk-card.js`): A single-file Lovelace card that communicates exclusively via those WebSocket commands. No dependency on todo entities or HA state machine.

### WebSocket Commands

All commands are prefixed `ourgroceries_kiosk/`. Defined in `const.py`, registered in `__init__.py`, implemented in `api.py`:

| Command | Purpose |
|---|---|
| `get_lists` | All shopping lists with item counts |
| `get_list_items` | Items for a specific list (id, name, crossed_off, category_id) |
| `add_item` | Add item to list |
| `remove_item` | Remove item from list |
| `update_item` | Rename / change quantity |
| `toggle_crossed_off` | Cross off or uncheck an item |
| `delete_crossed_off` | Bulk delete all crossed-off items |
| `get_categories` | Master categories + item→category map |
| `set_item_category` | Update category on master list + active list |

### Card View State Machine

The card manages a `_view` string that controls what `_getRoot()` renders:

- `loading` → initial blank state
- `wizard` → first-run setup (theme → list mode → list pick) — shown only when config is empty
- `lists` → list-of-lists view (shown in `all` mode)
- `list` → individual list with items, add input, crossed-off section
- `edit` → item detail (rename, quantity, category, delete)
- `categories` → category picker (slides over edit view)
- `settings` → theme + list mode picker (accessible via gear icon)

Transitions always re-render the entire `#og-root` div via `innerHTML`. There is no virtual DOM.

### Theme System

13 named themes + `system` (auto light/dark). Each theme is a plain object of CSS hex values in the `THEMES` constant at the top of the JS file. `_applyTheme()` writes CSS custom properties directly onto `:host`. The `--accent-color` variable equals `--header-bg` and drives buttons, icons, and category check marks throughout.

### Config Schema

```yaml
theme: citrus           # key from THEMES or 'system'
list_mode: all          # 'all' | 'single'
locked_list: "Groceries" # list name, required when list_mode=single
default_list: "Groceries" # optional, auto-opens this list in all mode
```

### Polling

The card polls every 30 seconds via `setInterval` in `_startPolling()`. On each tick it refreshes lists and categories; if currently viewing a list it also refreshes items. No WebSocket subscription — pure polling.

### Autocomplete

Sources (in priority order): current list items → master categories (from `get_categories`) → localStorage history. History is stored under key `og-kiosk-history-v4` with a max of 500 entries.

## Key Files

| File | Role |
|---|---|
| `custom_components/ourgroceries_kiosk/__init__.py` | Entry setup, static resource registration, WS handler registration |
| `custom_components/ourgroceries_kiosk/api.py` | All OurGroceries API calls |
| `custom_components/ourgroceries_kiosk/config_flow.py` | Credential entry + validation |
| `custom_components/ourgroceries_kiosk/frontend/ourgroceries-kiosk-card.js` | Entire frontend |
| `custom_components/ourgroceries_kiosk/translations/en.json` | Config flow UI strings (field labels, errors) |
| `designref/` | Reference screenshots from the OurGroceries Android app — consult these for visual/UX decisions |
