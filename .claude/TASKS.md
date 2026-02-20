# OurGroceries Kiosk Card — Tasks

## Completed

### Milestone: v4 HACS Integration Rewrite
- [x] Create HACS integration package structure
- [x] Implement config flow (username + password with validation)
- [x] Implement Python API client wrapping `ourgroceries` library
- [x] Define WebSocket command constants
- [x] Register WebSocket handlers in `__init__.py`
- [x] Implement all WebSocket commands: get_lists, get_list_items, add_item, remove_item, update_item, toggle_crossed_off, delete_crossed_off, get_categories, set_item_category, get_item_list_map
- [x] Auto-register card JS as Lovelace resource
- [x] Remove dependency on HA todo entities and shell commands
- [x] Remove old `src/`, `ha-config/`, `deploy.sh` files

### Milestone: Frontend Card (v4)
- [x] Refactor card to use custom WebSocket commands instead of todo entities
- [x] Implement first-run setup wizard (theme -> list mode -> list pick)
- [x] Implement list-of-lists view (multi-list browsing)
- [x] Implement single-list view with items grouped by category
- [x] Implement add-item with inline text field + plus button
- [x] Implement dedicated add-item page with autocomplete
- [x] Implement item edit view (rename, quantity, category, delete)
- [x] Implement category picker
- [x] Implement cross-off toggle (tap item -> crossed off, migrates to bottom)
- [x] Implement crossed-off section with bulk actions (delete all, uncross all)
- [x] Implement delete confirmation dialog
- [x] Implement 13 named themes + system auto (light/dark)
- [x] Implement in-card settings (gear icon): theme for all, list mode/locked list for admins
- [x] Implement admin PIN for settings access control
- [x] Implement 30-second auto-refresh polling
- [x] Implement autocomplete from item history + master categories + localStorage

### Milestone: Polish & Bug Fixes
- [x] Fix unclosed template literal preventing card registration
- [x] Fix items showing "Uncategorized" when category_id is set on list item
- [x] Fix editor focus loss when typing in Admin PIN field
- [x] Improve add-item navigation responsiveness
- [x] Add multi-list indicators
- [x] Add dark snackbar styling
- [x] Add empty state for lists with no items
- [x] Add theme name label in settings
- [x] Add floating add-view toast
- [x] Redesign admin PIN UI
- [x] Move add-item input above items list and make it sticky
- [x] Restore inline text field + plus button for add-item row

### Milestone: Distribution
- [x] Create hacs.json with metadata
- [x] Create README with installation, setup, configuration, troubleshooting
- [x] Add icon.png
- [x] Set up GitHub repository (joshdutcher/ourgroceries-kiosk-card)
- [x] Create releases: v0.1.0, v0.1.1, v0.1.2
- [x] Reset version numbering scheme (v0.0.12 -> v0.1.x)

## Pending

### Performance: Backend API Call Reduction
- [ ] Cache `get_categories` server-side with ~5 min TTL — currently fires two OurGroceries API calls (`get_category_items` + `get_master_list`) on every poll tick and page load; categories are nearly static; invalidate on `set_item_category`
- [ ] Cache `get_lists` and `get_list_items` with short TTL (~15-30s) — prevents double-fetching when multiple card instances are open or when poll fires at the same time as a user action
- [ ] Eliminate redundant fetches in `set_item_category` — currently calls `get_category_items` and `get_master_list` to resolve IDs, but frontend already holds `_categoryNameToId` and knows the master item ID; accept `category_id` directly to eliminate 2 of 4 API calls
- [ ] Add retry-on-auth-failure in `_ensure_login` — if WS call raises auth/session-expired error, auto re-login and retry once before surfacing error to user (handles long kiosk sessions)
- [ ] Evaluate `get_item_list_map` — N+1 call (1 `get_my_lists` + 1 `get_list_items` per list); consider removing from poll and fetching lazily only when add view opens, or folding data into `get_lists`

### Performance: Frontend UI Snappiness
- [ ] Skip `get_item_list_map` from 30-second poll when add view is not open — most expensive call, only matters in add view; guard with `this._view === 'add'` check
- [ ] Poll categories less frequently — move to separate ~10 min interval or fetch once on load and re-fetch only when category picker opens
- [ ] Optimistic add-item — immediately push placeholder item into `this._items` and re-render, then replace with real item on WS response; roll back on error
- [ ] Skip `get_list_items` re-fetch on back-navigation from add view when items are fresh (<5s old)
- [ ] Debounce `_filterAddViewItems` on rapid keystrokes — wrap in `requestAnimationFrame` or 30ms debounce to prevent jank on slow tablet CPUs
- [ ] Batch `uncrossOffAll` into single backend call — currently fires N parallel `toggle_crossed_off` WS requests; add `uncross_all_items` backend command or serialize calls to avoid rate limits
- [ ] Avoid full `innerHTML` replacement on poll-driven list refreshes — consider keyed diffing to only update changed rows, preventing scroll position loss and focus stealing

### Project Hygiene
- [ ] Sync manifest.json version (0.1.1) with JS card version (0.1.2)
- [ ] Add `screenshots/` directory with actual card screenshots (README references `screenshots/card.png` and `screenshots/tablet.png` that don't exist)
- [ ] Add `.env` to `.gitignore` (per global standards)
- [ ] Add `Zone.Identifier` to `.gitignore` (per global standards, WSL2 artifact)

### Future Considerations
- [ ] HACS validation — ensure integration passes HACS validation before submitting to default repository
- [ ] GitHub repo topics: `home-assistant`, `lovelace`, `hacs`, `ourgroceries`, `kiosk`
- [ ] CI/CD pipeline (GitHub Actions) — linting, formatting checks
- [ ] Makefile with standard targets (test, dev, build, clean)
- [ ] Testing infrastructure — unit tests for Python backend, integration tests for WebSocket handlers

## Version History

| Version | Date | Highlights |
|---|---|---|
| v3.0.0 | 2026-02-16 | Initial commit — working card with manual install |
| — | 2026-02-17 | Converted to HACS integration, added config flow, icon, settings UI |
| — | 2026-02-17 | Added dedicated add-item page, crossed-off actions, sticky input |
| v0.1.0 | 2026-02-18 | First tagged release — version numbering reset |
| v0.1.1 | 2026-02-18 | Multi-list indicators, dark snackbar, empty state, theme labels |
| v0.1.2 | 2026-02-18 | Delete confirmation, floating toast, admin PIN redesign, template literal fix |
