# OurGroceries Kiosk Card — Planning

## Vision

A self-contained HACS integration for Home Assistant that provides a touch-friendly Lovelace card for managing OurGroceries shopping lists on a wall tablet. One install, no YAML, no shell commands — enter credentials, add the card, done.

The project started as a manual-install card (v3) depending on HA's built-in OurGroceries integration and todo entities. The v4 rewrite eliminates all external dependencies by bundling its own Python backend with direct OurGroceries API access via custom WebSocket commands.

## Repository

- **GitHub:** `joshdutcher/ourgroceries-kiosk-card`
- **License:** MIT
- **Current version:** 0.1.2 (manifest: 0.1.1, JS: `OG_CARD_VERSION = '0.1.2'`)
- **Tags:** v0.1.0, v0.1.1, v0.1.2

## Architecture

### Two-Layer Structure

```
custom_components/ourgroceries_kiosk/
  __init__.py          # Setup, static resource registration, WS handler registration
  api.py               # Async OurGroceries API client (wraps `ourgroceries` PyPI lib)
  config_flow.py       # HA config flow: username + password
  const.py             # Constants (domain, WS command names)
  manifest.json        # Integration metadata
  strings.json         # UI strings for config flow
  translations/en.json # English translations
  frontend/
    ourgroceries-kiosk-card.js   # Entire frontend (2408 lines, 90KB)
```

**Python backend:** Standard HA integration wrapping the `ourgroceries` PyPI library (>=1.3.0). Credentials stored in HA config entry (entered via config flow). Registers custom WebSocket command handlers and serves the card JS as a static Lovelace resource.

**JavaScript frontend:** Single-file Lovelace card using vanilla JS / Web Components / Shadow DOM. No build step, no bundler, no transpilation. Communicates exclusively via WebSocket commands. No dependency on todo entities or HA state machine.

### WebSocket Commands

All prefixed `ourgroceries_kiosk/`, defined in `const.py`, registered in `__init__.py`, implemented in `api.py`:

| Command | Purpose |
|---|---|
| `get_lists` | All shopping lists with item counts |
| `get_list_items` | Items for a specific list (id, name, crossed_off, category_id) |
| `add_item` | Add item to list |
| `remove_item` | Remove item from list |
| `update_item` | Rename / change quantity |
| `toggle_crossed_off` | Cross off or uncheck an item |
| `delete_crossed_off` | Bulk delete all crossed-off items |
| `get_categories` | Master categories + item-to-category map |
| `set_item_category` | Update category on master list + active list |
| `get_item_list_map` | Map of items to which lists they appear on |

### Card View State Machine

`_view` string controls what `_getRoot()` renders:

- `loading` — initial blank state
- `wizard` — first-run setup (theme -> list mode -> list pick), shown only when config is empty
- `lists` — list-of-lists view (shown in `all` mode)
- `list` — individual list with items, add input, crossed-off section
- `edit` — item detail (rename, quantity, category, delete)
- `categories` — category picker (slides over edit view)
- `settings` — theme + list mode picker (accessible via gear icon)

Transitions re-render the entire `#og-root` div via `innerHTML`. No virtual DOM.

### Theme System

13 named themes + `system` (auto light/dark). Each theme is a plain object of CSS hex values in the `THEMES` constant. `_applyTheme()` writes CSS custom properties onto `:host`. `--accent-color` equals `--header-bg` and drives buttons, icons, and category check marks.

| Theme | `--header-bg` | `--category-bg` | `--page-bg` | `--item-bg` | `--text-primary` |
|-------|--------------|----------------|------------|------------|-----------------|
| citrus | #81a51d | #d3bb19 | #fdf8e8 | #fff8e8 | #333333 |
| dark | #2a5828 | #2a5828 | #0c1a0c | #152015 | #ffffff |
| light | #3d7a28 | #3d7a28 | #eef5ee | #ffffff | #333333 |
| berries | #c068a0 | #7068b8 | #f5f0f8 | #ffffff | #333333 |
| chestnut | #7a3028 | #c49060 | #f8f3ee | #ffffff | #333333 |
| festival | #e85870 | #90c020 | #fdf5f5 | #ffffff | #333333 |
| grapevine | #787a18 | #aabb18 | #f8f8ee | #ffffff | #333333 |
| ice | #2898b8 | #50bed8 | #eef8fc | #ffffff | #333333 |
| miami | #3aa8a0 | #f06080 | #eef8f8 | #ffffff | #333333 |
| old_glory | #1a3a8c | #b83820 | #f0f2f8 | #ffffff | #333333 |
| peacock | #2d7878 | #3a9890 | #eef4f4 | #ffffff | #333333 |
| tangerine | #e87022 | #d08030 | #fdf5ee | #ffffff | #333333 |
| vino | #6a2028 | #c06070 | #f8f0f2 | #ffffff | #333333 |

Additional derived variables per theme: `--text-on-accent` (white for all), `--badge-bg` (= `--header-bg`), `--crossed-off-bg`, `--crossed-off-text`.

**System default** uses `window.matchMedia('(prefers-color-scheme: dark)')` to auto-select Light or Dark. Updates dynamically.

### Config Schema

```yaml
type: custom:ourgroceries-kiosk-card
theme: citrus           # key from THEMES or 'system'
list_mode: all          # 'all' | 'single'
locked_list: "Groceries" # list name, required when list_mode=single
default_list: "Groceries" # optional, auto-opens this list in all mode
```

### Polling

Every 30 seconds via `setInterval` in `_startPolling()`. Each tick refreshes lists and categories; if viewing a list, also refreshes items. Pure polling, no WebSocket subscriptions.

### Autocomplete

Priority order: current list items -> master categories (from `get_categories`) -> localStorage history. History stored under key `og-kiosk-history-v4`, max 500 entries.

## Technology Stack

| Layer | Technology |
|---|---|
| Backend | Python 3, Home Assistant integration framework |
| API library | `ourgroceries` PyPI package (>=1.3.0) |
| Frontend | Vanilla JavaScript, Web Components, Shadow DOM |
| Communication | Home Assistant WebSocket API |
| Distribution | HACS (Home Assistant Community Store) |
| Config storage | HA config entries (secure credential storage) |

No build tools, no bundler, no transpilation, no npm dependencies.

## Deployment

### HACS Distribution

`hacs.json` (repo root):
```json
{
  "name": "OurGroceries Kiosk",
  "homeassistant": "2023.6.0",
  "hacs": "1.34.0"
}
```

### Manual Testing

Copy integration into HA instance and restart:
```bash
sudo cp -r custom_components/ourgroceries_kiosk /var/lib/homeassistant/homeassistant/custom_components/
sudo systemctl restart homeassistant
```

JS-only changes: hard browser refresh (`Ctrl+Shift+R`) is usually sufficient — no HA restart needed.

### Kiosk Mode (Companion)

The card works standalone but pairs with [Kiosk Mode](https://github.com/NemesisRE/kiosk-mode) (separate HACS frontend plugin) for a clean full-screen tablet experience. Dedicated non-admin HA user for the tablet, admin users keep full HA chrome. Escape hatch: `?disable_km` URL parameter.

## Design References

The `designref/` directory contains reference screenshots from the OurGroceries Android app (gitignored, not distributed). Consult these for visual/UX decisions: theme colors, add-item flow, crossed-off behavior, category picker, empty states, multi-list navigation.

## Out of Scope

- Recipe management (OurGroceries recipes not supported)
- Creating or deleting lists (use the OurGroceries app)
- Barcode scanning
- Real-time push updates (polling only)
