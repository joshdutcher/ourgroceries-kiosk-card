# OurGroceries Kiosk Card

A Home Assistant Lovelace card designed for kitchen wall tablets. Provides a full-screen, touch-friendly interface for managing your OurGroceries shopping lists — styled to match the official OurGroceries Android app.

**No todo entities. No shell commands. No YAML configuration required.** One HACS install, enter your credentials, add the card, and go.

## Features

- Browse all your OurGroceries lists or lock to a single list
- Add, edit, and remove items
- Tap items to cross them off; bulk delete or uncross crossed-off items
- Items grouped by category with colored category bars
- Category picker syncs changes back to OurGroceries
- Quantity controls (Fewer / More)
- 13 built-in themes + system auto (light/dark) theme
- Autocomplete from your OurGroceries item history
- First-run setup wizard
- In-card settings (theme, list mode) accessible via gear icon
- 30-second auto-refresh polling

## Prerequisites

- [HACS](https://hacs.xyz/) installed in your Home Assistant instance
- An [OurGroceries](https://www.ourgroceries.com/) account

## Installation

1. Open HACS in Home Assistant
2. Go to **Integrations**
3. Click the **+** button → search for **OurGroceries Kiosk**
4. Click **Install**
5. Restart Home Assistant

### Manual Installation

Copy the `custom_components/ourgroceries_kiosk/` folder into your Home Assistant `custom_components/` directory and restart.

## Setup

1. Go to **Settings → Devices & Services → Add Integration**
2. Search for **OurGroceries Kiosk**
3. Enter your OurGroceries email and password
4. The integration validates your credentials and stores them securely

## Adding the Card

1. Edit your dashboard
2. **Add Card** → search for **OurGroceries Kiosk**
3. The first-run wizard walks you through theme and list mode selection

### Card Configuration

```yaml
type: custom:ourgroceries-kiosk-card
theme: citrus           # Theme name (default: citrus)
list_mode: all          # 'single' or 'all' (default: all)
locked_list: "Groceries" # Required if list_mode is 'single'
default_list: "Groceries" # Optional — auto-open this list in 'all' mode
```

### Available Themes

`citrus` · `dark` · `light` · `berries` · `chestnut` · `festival` · `grapevine` · `ice` · `miami` · `old_glory` · `peacock` · `tangerine` · `vino` · `system` (auto light/dark)

## Changing Settings

Tap the **gear icon** in the card header to access settings at any time. You can change the theme, list mode, locked list, and default list.

## Kiosk Mode (Companion)

For a clean full-screen experience on a wall tablet, install the separate [Kiosk Mode](https://github.com/NemesisRE/kiosk-mode) HACS frontend plugin.

**Recommended dashboard YAML:**

```yaml
kiosk_mode:
  non_admin_settings:
    kiosk: true
  admin_settings:
    kiosk: false
```

**Setup pattern:** Create a dedicated non-admin HA user for the tablet. Non-admin users see a clean full-screen view. Admin users retain the full HA chrome for editing.

**Escape hatch:** Append `?disable_km` to the dashboard URL to temporarily disable kiosk mode.

## How It Works

The integration communicates directly with the OurGroceries API using your stored credentials. The Lovelace card talks to the integration via Home Assistant WebSocket commands — no todo entities, shell commands, or external scripts are involved.

## Troubleshooting

- **Card shows "No lists found"**: Check that your OurGroceries credentials are correct in Settings → Devices & Services → OurGroceries Kiosk.
- **Changes don't appear on other devices**: The integration polls every 30 seconds. Changes made in the card are pushed immediately; changes from the OurGroceries app will appear within 30 seconds.
- **Card not appearing in Add Card dialog**: Restart Home Assistant after installing the integration. The card JS is auto-registered as a Lovelace resource.

## Out of Scope

- Recipe management (OurGroceries recipes are not supported)
- Creating or deleting lists (use the OurGroceries app)
- Barcode scanning

## License

MIT
