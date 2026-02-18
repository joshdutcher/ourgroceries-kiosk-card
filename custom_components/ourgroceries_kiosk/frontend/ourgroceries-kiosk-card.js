/**
 * OurGroceries Kiosk Card v4.0.0
 * HACS Lovelace card for kitchen tablet kiosks.
 * Communicates via WebSocket API — no todo entities, no shell commands.
 * Vanilla HTMLElement / Shadow DOM — no build step.
 */

const OG_CARD_VERSION = '0.0.12';

/* ------------------------------------------------------------------ */
/*  Themes                                                             */
/* ------------------------------------------------------------------ */

const THEMES = {
  citrus:    { headerBg:'#81a51d', categoryBg:'#d3bb19', pageBg:'#fdf8e8', itemBg:'#fff8e8', textPrimary:'#333333', crossedOffBg:'#f5f0d8', crossedOffText:'#888888' },
  dark:      { headerBg:'#2a5828', categoryBg:'#2a5828', pageBg:'#0c1a0c', itemBg:'#152015', textPrimary:'#ffffff', crossedOffBg:'#0a140a', crossedOffText:'#666666' },
  light:     { headerBg:'#3d7a28', categoryBg:'#3d7a28', pageBg:'#eef5ee', itemBg:'#ffffff', textPrimary:'#333333', crossedOffBg:'#ddeedd', crossedOffText:'#888888' },
  berries:   { headerBg:'#c068a0', categoryBg:'#7068b8', pageBg:'#f5f0f8', itemBg:'#ffffff', textPrimary:'#333333', crossedOffBg:'#ebe5f0', crossedOffText:'#888888' },
  chestnut:  { headerBg:'#7a3028', categoryBg:'#c49060', pageBg:'#f8f3ee', itemBg:'#ffffff', textPrimary:'#333333', crossedOffBg:'#f0e8e0', crossedOffText:'#888888' },
  festival:  { headerBg:'#e85870', categoryBg:'#90c020', pageBg:'#fdf5f5', itemBg:'#ffffff', textPrimary:'#333333', crossedOffBg:'#f5eaea', crossedOffText:'#888888' },
  grapevine: { headerBg:'#787a18', categoryBg:'#aabb18', pageBg:'#f8f8ee', itemBg:'#ffffff', textPrimary:'#333333', crossedOffBg:'#f0f0e0', crossedOffText:'#888888' },
  ice:       { headerBg:'#2898b8', categoryBg:'#50bed8', pageBg:'#eef8fc', itemBg:'#ffffff', textPrimary:'#333333', crossedOffBg:'#e0f0f8', crossedOffText:'#888888' },
  miami:     { headerBg:'#3aa8a0', categoryBg:'#f06080', pageBg:'#eef8f8', itemBg:'#ffffff', textPrimary:'#333333', crossedOffBg:'#e0f0f0', crossedOffText:'#888888' },
  old_glory: { headerBg:'#1a3a8c', categoryBg:'#b83820', pageBg:'#f0f2f8', itemBg:'#ffffff', textPrimary:'#333333', crossedOffBg:'#e0e5f0', crossedOffText:'#888888' },
  peacock:   { headerBg:'#2d7878', categoryBg:'#3a9890', pageBg:'#eef4f4', itemBg:'#ffffff', textPrimary:'#333333', crossedOffBg:'#e0ecec', crossedOffText:'#888888' },
  tangerine: { headerBg:'#e87022', categoryBg:'#d08030', pageBg:'#fdf5ee', itemBg:'#ffffff', textPrimary:'#333333', crossedOffBg:'#f5e8d8', crossedOffText:'#888888' },
  vino:      { headerBg:'#6a2028', categoryBg:'#c06070', pageBg:'#f8f0f2', itemBg:'#ffffff', textPrimary:'#333333', crossedOffBg:'#f0e0e5', crossedOffText:'#888888' },
};

function _getSystemTheme() {
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function _resolveTheme(name) {
  if (name === 'system') return THEMES[_getSystemTheme()];
  return THEMES[name] || THEMES.citrus;
}

/* ------------------------------------------------------------------ */
/*  Editor (card configuration UI)                                     */
/* ------------------------------------------------------------------ */

class OurGroceriesKioskCardEditor extends HTMLElement {
  constructor() {
    super();
    this._config = {};
    this._hass = null;
    this._lists = [];
    this._listsFetched = false;
    this._rendered = false;
  }

  set hass(hass) {
    this._hass = hass;
    if (!this._listsFetched && hass && hass.connection) {
      this._listsFetched = true;
      hass.connection.sendMessagePromise({ type: 'ourgroceries_kiosk/get_lists' })
        .then(result => { this._lists = result.lists || []; this._render(); })
        .catch(() => {});
    }
  }

  setConfig(config) {
    this._config = { ...config };
    if (!this._rendered) this._render();
  }

  _render() {
    this._rendered = true;
    if (this.shadowRoot) this.shadowRoot.innerHTML = '';
    else this.attachShadow({ mode: 'open' });

    const root = this.shadowRoot;
    const themeOptions = ['system', ...Object.keys(THEMES)].map(t =>
      `<option value="${t}" ${this._config.theme === t ? 'selected' : ''}>${t}</option>`
    ).join('');

    // Determine current shopping list selection from config
    const shoppingListValue = this._config.list_mode === 'single' && this._config.locked_list
      ? this._config.locked_list : '__all__';
    const showDefault = shoppingListValue === '__all__';

    const sortedLists = [...this._lists].sort((a, b) => a.name.localeCompare(b.name));

    const shoppingListOptions = [
      `<option value="__all__" ${shoppingListValue === '__all__' ? 'selected' : ''}>All lists</option>`,
      ...sortedLists.map(l =>
        `<option value="${l.name}" ${shoppingListValue === l.name ? 'selected' : ''}>${l.name}</option>`
      ),
    ].join('');

    const defaultListOptions = [
      `<option value="" ${!this._config.default_list ? 'selected' : ''}>None</option>`,
      ...sortedLists.map(l =>
        `<option value="${l.name}" ${this._config.default_list === l.name ? 'selected' : ''}>${l.name}</option>`
      ),
    ].join('');

    root.innerHTML = `
      <style>
        .editor { padding: 16px; font-family: var(--paper-font-body1_-_font-family, sans-serif); }
        .row { margin-bottom: 12px; }
        label { display: block; font-weight: 500; margin-bottom: 4px; font-size: 14px; }
        .hint { font-size: 12px; color: var(--secondary-text-color, #666); margin-top: 2px; }
        input, select { width: 100%; box-sizing: border-box; padding: 8px; border: 1px solid var(--divider-color, #ccc); border-radius: 4px; font-size: 14px; background: var(--card-background-color, #fff); color: var(--primary-text-color, #000); }
      </style>
      <div class="editor">
        <div class="row">
          <label>Theme</label>
          <select id="theme">${themeOptions}</select>
        </div>
        <div class="row">
          <label>Shopping List</label>
          <select id="shopping_list">${shoppingListOptions}</select>
        </div>
        <div class="row" id="default-row" style="${showDefault ? '' : 'display:none'}">
          <label>Default List (optional)</label>
          <select id="default_list">${defaultListOptions}</select>
        </div>
        <div class="row">
          <label>Admin PIN</label>
          <input type="text" inputmode="numeric" id="admin_pin" value="${this._config.admin_pin || ''}" placeholder="e.g. 1234">
          <div class="hint">Lets non-admin users unlock list settings on the card via the gear icon.</div>
        </div>
      </div>
    `;

    const fire = () => {
      this.dispatchEvent(new CustomEvent('config-changed', {
        detail: { config: { ...this._config } }, bubbles: true, composed: true,
      }));
    };

    root.getElementById('theme').addEventListener('change', e => {
      this._config.theme = e.target.value;
      fire();
    });

    root.getElementById('shopping_list').addEventListener('change', e => {
      const value = e.target.value;
      if (value === '__all__') {
        this._config.list_mode = 'all';
        this._config.locked_list = '';
      } else {
        this._config.list_mode = 'single';
        this._config.locked_list = value;
        this._config.default_list = '';
      }
      fire();
      // Show/hide the default list row
      const defaultRow = root.getElementById('default-row');
      if (defaultRow) defaultRow.style.display = value === '__all__' ? '' : 'none';
    });

    root.getElementById('default_list').addEventListener('change', e => {
      this._config.default_list = e.target.value;
      fire();
    });

    root.getElementById('admin_pin').addEventListener('input', e => {
      const val = e.target.value.replace(/\D/g, '');
      e.target.value = val;
      this._config.admin_pin = val;
      fire();
    });
  }
}

/* ------------------------------------------------------------------ */
/*  Main Card                                                          */
/* ------------------------------------------------------------------ */

class OurGroceriesKioskCard extends HTMLElement {
  static getConfigElement() { return document.createElement('ourgroceries-kiosk-card-editor'); }
  static getStubConfig() { return { theme: 'citrus', list_mode: 'all' }; }

  constructor() {
    super();
    this._config = {};
    this._hass = null;

    // Data
    this._lists = [];
    this._items = [];
    this._masterCategories = {};
    this._allCategories = [];
    this._categoryNameToId = {};
    this._categoryIdMap = {};
    this._masterItems = [];

    // State
    this._currentListId = null;
    this._currentListName = '';
    this._view = 'loading'; // loading, wizard, lists, list, add, edit, categories, settings
    this._editingItem = null;
    this._editItemCategory = null;
    this._settingsUnlocked = false;
    this._editNameDirty = false;
    this._autocompleteIdx = -1;
    this._statusTimeoutId = null;
    this._pollId = null;
    this._domBuilt = false;
    this._wizardStep = 1;
    this._HISTORY_KEY = 'og-kiosk-history-v4';
    this._MAX_HISTORY = 500;

    // System theme listener
    this._mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    this._onSystemThemeChange = () => { if (this._config.theme === 'system') this._applyTheme(); };
  }

  connectedCallback() {
    this._mediaQuery.addEventListener('change', this._onSystemThemeChange);
    if (this._domBuilt) this._startPolling();
  }

  disconnectedCallback() {
    this._mediaQuery.removeEventListener('change', this._onSystemThemeChange);
    this._stopPolling();
    if (this._statusTimeoutId) clearTimeout(this._statusTimeoutId);
  }

  setConfig(config) {
    this._config = {
      theme: config.theme || 'citrus',
      list_mode: config.list_mode || 'all',
      locked_list: config.locked_list || '',
      default_list: config.default_list || '',
      admin_pin: config.admin_pin || '',
    };
    // Overlay per-device localStorage overrides on top of YAML defaults
    try {
      const local = JSON.parse(localStorage.getItem('og-kiosk-device-config') || '{}');
      if (local.theme) this._config.theme = local.theme;
      if (local.list_mode) this._config.list_mode = local.list_mode;
      if (local.locked_list !== undefined) this._config.locked_list = local.locked_list;
      if (local.default_list !== undefined) this._config.default_list = local.default_list;
    } catch (_) { /* ignore corrupt localStorage */ }
    if (this._domBuilt) this._applyTheme();
  }

  getCardSize() { return 8; }

  set hass(hass) {
    const firstSet = !this._hass;
    this._hass = hass;
    if (firstSet) {
      this._buildDom();
      this._initialLoad();
    }
  }

  get hass() { return this._hass; }

  /* ---- WebSocket helpers ---- */

  async _ws(type, data = {}) {
    if (!this._hass || !this._hass.connection) throw new Error('No HA connection');
    return await this._hass.connection.sendMessagePromise({ type, ...data });
  }

  /* ---- Initial load ---- */

  async _initialLoad() {
    try {
      const [listsResult, catResult] = await Promise.all([
        this._ws('ourgroceries_kiosk/get_lists'),
        this._ws('ourgroceries_kiosk/get_categories'),
      ]);
      this._lists = listsResult.lists || [];
      this._masterCategories = catResult.master_categories || {};
      this._allCategories = catResult.categories || [];
      this._categoryNameToId = catResult.category_name_to_id || {};
      this._categoryIdMap = catResult.category_id_map || {};
      this._masterItems = catResult.master_items || [];
    } catch (err) {
      console.error('OG Kiosk: initial load failed', err);
      this._lists = [];
    }

    // Determine initial view
    if (!this._config.theme || this._config.theme === '') {
      this._wizardStep = 1;
      this._renderWizard();
    } else if (this._config.list_mode === 'single' && this._config.locked_list) {
      await this._navigateToListByName(this._config.locked_list);
    } else if (this._config.default_list) {
      await this._navigateToListByName(this._config.default_list);
    } else {
      this._renderLists();
    }

    this._startPolling();
  }

  async _navigateToListByName(name) {
    const list = this._lists.find(l => l.name.toLowerCase() === name.toLowerCase());
    if (list) {
      await this._openList(list.id, list.name);
    } else {
      this._renderLists();
    }
  }

  /* ---- Polling ---- */

  _startPolling() {
    this._stopPolling();
    this._pollId = setInterval(() => this._poll(), 30000);
  }

  _stopPolling() {
    if (this._pollId) { clearInterval(this._pollId); this._pollId = null; }
  }

  async _poll() {
    try {
      const [listsResult, catResult] = await Promise.all([
        this._ws('ourgroceries_kiosk/get_lists'),
        this._ws('ourgroceries_kiosk/get_categories'),
      ]);
      this._lists = listsResult.lists || [];
      this._masterCategories = catResult.master_categories || {};
      this._allCategories = catResult.categories || [];
      this._categoryNameToId = catResult.category_name_to_id || {};
      this._categoryIdMap = catResult.category_id_map || {};
      this._masterItems = catResult.master_items || [];

      if (this._view === 'lists') this._renderLists();
      else if (this._view === 'list' && this._currentListId) {
        await this._refreshListItems();
      } else if (this._view === 'add' && this._currentListId) {
        try {
          const result = await this._ws('ourgroceries_kiosk/get_list_items', { list_id: this._currentListId });
          this._items = result.items || [];
          this._refreshAddViewItems();
        } catch (_) {}
      }
    } catch (err) {
      console.warn('OG Kiosk: poll failed', err);
    }
  }

  async _refreshListItems() {
    if (!this._currentListId) return;
    try {
      const result = await this._ws('ourgroceries_kiosk/get_list_items', { list_id: this._currentListId });
      this._items = result.items || [];
      this._renderListItems();
    } catch (err) {
      console.warn('OG Kiosk: refresh items failed', err);
    }
  }

  /* ---- DOM construction ---- */

  _buildDom() {
    if (this.shadowRoot) this.shadowRoot.innerHTML = '';
    else this.attachShadow({ mode: 'open' });

    this.shadowRoot.innerHTML = `
      <style>${this._buildStyles()}</style>
      <ha-card>
        <div id="og-root" class="og-root"></div>
      </ha-card>
    `;
    this._domBuilt = true;
    this._applyTheme();
  }

  _applyTheme() {
    const t = _resolveTheme(this._config.theme);
    this.style.setProperty('--header-bg', t.headerBg);
    this.style.setProperty('--category-bg', t.categoryBg);
    this.style.setProperty('--page-bg', t.pageBg);
    this.style.setProperty('--item-bg', t.itemBg);
    this.style.setProperty('--text-primary', t.textPrimary);
    this.style.setProperty('--text-on-accent', '#ffffff');
    this.style.setProperty('--accent-color', t.headerBg);
    this.style.setProperty('--crossed-off-bg', t.crossedOffBg);
    this.style.setProperty('--crossed-off-text', t.crossedOffText);
    this.style.setProperty('--badge-bg', t.headerBg);
    // Divider: slightly darker/lighter than page bg
    const isDark = t.textPrimary === '#ffffff';
    this.style.setProperty('--divider-color', isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.08)');
    this.style.setProperty('--overlay-bg', isDark ? 'rgba(0,0,0,0.6)' : 'rgba(0,0,0,0.45)');
  }

  _getRoot() { return this.shadowRoot && this.shadowRoot.getElementById('og-root'); }

  /* ---- View: List of Lists ---- */

  _renderLists() {
    const root = this._getRoot();
    if (!root) return;
    this._view = 'lists';

    let html = `
      <div class="og-header">
        <span class="og-header-title">Shopping Lists</span>
        <button class="og-header-icon-btn" id="og-settings-btn" aria-label="Settings">
          <svg viewBox="0 0 24 24" width="24" height="24"><path fill="currentColor" d="M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58a.49.49 0 00.12-.61l-1.92-3.32a.49.49 0 00-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54a.48.48 0 00-.48-.41h-3.84a.48.48 0 00-.48.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96a.49.49 0 00-.59.22L2.74 8.87a.48.48 0 00.12.61l2.03 1.58c-.05.3-.07.62-.07.94s.02.64.07.94l-2.03 1.58a.49.49 0 00-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.48-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z"/></svg>
        </button>
      </div>
      <div class="og-lists-container">
    `;

    const sorted = [...this._lists].sort((a, b) => a.name.localeCompare(b.name));
    for (const list of sorted) {
      html += `
        <button class="og-list-row" data-list-id="${this._escAttr(list.id)}" data-list-name="${this._escAttr(list.name)}">
          <span class="og-list-row-name">${this._escHtml(list.name)}</span>
          ${list.item_count > 0 ? `<span class="og-list-row-badge">${list.item_count}</span>` : ''}
        </button>
      `;
    }

    if (sorted.length === 0) {
      html += '<div class="og-empty">No lists found</div>';
    }

    html += '</div>';
    root.innerHTML = html;

    root.querySelectorAll('.og-list-row').forEach(btn => {
      btn.addEventListener('click', () => {
        this._openList(btn.dataset.listId, btn.dataset.listName);
      });
    });

    const settingsBtn = root.querySelector('#og-settings-btn');
    if (settingsBtn) settingsBtn.addEventListener('click', () => this._renderSettings());
  }

  async _openList(listId, listName) {
    this._currentListId = listId;
    this._currentListName = listName;

    try {
      const result = await this._ws('ourgroceries_kiosk/get_list_items', { list_id: listId });
      this._items = result.items || [];
    } catch (err) {
      console.error('OG Kiosk: failed to load list', err);
      this._items = [];
    }
    this._renderListView();
  }

  /* ---- View: List Items ---- */

  _renderListView() {
    const root = this._getRoot();
    if (!root) return;
    this._view = 'list';

    const showBack = this._config.list_mode !== 'single';

    let html = `
      <div class="og-header">
        ${showBack ? `
          <button class="og-header-back-btn" id="og-back-btn" aria-label="Back">
            <svg viewBox="0 0 24 24" width="22" height="22"><path fill="currentColor" d="M15.41 7.41L14 6l-6 6 6 6 1.41-1.41L10.83 12z"/></svg>
          </button>
        ` : ''}
        <span class="og-header-title">${this._escHtml(this._currentListName)}</span>
        <button class="og-header-icon-btn" id="og-settings-btn" aria-label="Settings">
          <svg viewBox="0 0 24 24" width="24" height="24"><path fill="currentColor" d="M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58a.49.49 0 00.12-.61l-1.92-3.32a.49.49 0 00-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54a.48.48 0 00-.48-.41h-3.84a.48.48 0 00-.48.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96a.49.49 0 00-.59.22L2.74 8.87a.48.48 0 00.12.61l2.03 1.58c-.05.3-.07.62-.07.94s.02.64.07.94l-2.03 1.58a.49.49 0 00-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.48-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z"/></svg>
        </button>
      </div>
      <div class="og-list-view-body">
        <div class="og-add-item-row" id="og-add-trigger">
          <div class="og-input-wrapper">
            <input type="text" placeholder="Add an item..." readonly />
          </div>
          <button class="og-add-btn" aria-label="Add">
            <svg viewBox="0 0 24 24" width="24" height="24"><path fill="currentColor" d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/></svg>
          </button>
        </div>
        <div id="og-status" class="og-status hidden"></div>
        <div id="og-items-container" class="og-items-container"></div>
        <div id="og-crossed-container" class="og-crossed-container"></div>
      </div>
    `;

    root.innerHTML = html;
    this._bindListViewEvents();
    this._renderListItems();
  }

  _bindListViewEvents() {
    const root = this._getRoot();
    if (!root) return;

    const backBtn = root.querySelector('#og-back-btn');
    if (backBtn) backBtn.addEventListener('click', () => {
      this._currentListId = null;
      this._renderLists();
    });

    const settingsBtn = root.querySelector('#og-settings-btn');
    if (settingsBtn) settingsBtn.addEventListener('click', () => this._renderSettings());

    const addTrigger = root.querySelector('#og-add-trigger');
    if (addTrigger) addTrigger.addEventListener('click', () => {
      // Show immediate visual feedback, then render on next frame
      addTrigger.classList.add('og-tapped');
      requestAnimationFrame(() => this._showAddView());
    });
  }

  _renderListItems() {
    const root = this._getRoot();
    if (!root) return;
    const container = root.querySelector('#og-items-container');
    const crossedContainer = root.querySelector('#og-crossed-container');
    if (!container || !crossedContainer) return;

    const active = this._items.filter(i => !i.crossed_off);
    const crossedOff = this._items.filter(i => i.crossed_off);

    // Active items grouped by category
    let html = '';
    const grouped = this._groupByCategory(active);
    const categoryNames = Object.keys(grouped).sort((a, b) =>
      a === 'Uncategorized' ? 1 : b === 'Uncategorized' ? -1 :
      a.toLowerCase().localeCompare(b.toLowerCase())
    );

    for (const cat of categoryNames) {
      const items = grouped[cat].sort((a, b) =>
        a.name.toLowerCase().localeCompare(b.name.toLowerCase())
      );

      if (categoryNames.length > 1 || cat !== 'Uncategorized') {
        html += `<div class="og-category-bar">${this._escHtml(cat)}</div>`;
      }

      for (const item of items) {
        html += `
          <div class="og-item" data-id="${this._escAttr(item.id)}">
            <span class="og-item-name" data-id="${this._escAttr(item.id)}">${this._escHtml(item.name)}</span>
            <button class="og-item-menu-btn" data-id="${this._escAttr(item.id)}" aria-label="Edit">
              <svg viewBox="0 0 24 24" width="20" height="20"><circle cx="5" cy="12" r="2" fill="currentColor"/><circle cx="12" cy="12" r="2" fill="currentColor"/><circle cx="19" cy="12" r="2" fill="currentColor"/></svg>
            </button>
          </div>
        `;
      }
    }

    if (active.length === 0 && crossedOff.length === 0) {
      html = '<div class="og-empty">List is empty</div>';
    }

    container.innerHTML = html;

    // Bind tap-to-cross-off on item names
    container.querySelectorAll('.og-item-name').forEach(el => {
      el.addEventListener('click', (e) => {
        e.stopPropagation();
        this._toggleCrossedOff(el.dataset.id, true);
      });
    });

    // Bind three-dot menu
    container.querySelectorAll('.og-item-menu-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        this._showEditView(btn.dataset.id);
      });
    });

    // Crossed-off items
    let crossedHtml = '';
    if (crossedOff.length > 0) {
      const sorted = [...crossedOff].sort((a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase()));
      for (const item of sorted) {
        crossedHtml += `
          <div class="og-crossed-item" data-id="${this._escAttr(item.id)}">
            <span class="og-crossed-name">${this._escHtml(item.name)}</span>
            <button class="og-item-menu-btn crossed" data-id="${this._escAttr(item.id)}" aria-label="Edit">
              <svg viewBox="0 0 24 24" width="20" height="20"><circle cx="5" cy="12" r="2" fill="currentColor"/><circle cx="12" cy="12" r="2" fill="currentColor"/><circle cx="19" cy="12" r="2" fill="currentColor"/></svg>
            </button>
          </div>
        `;
      }
      crossedHtml += `
        <div class="og-crossed-actions">
          <button class="og-crossed-action-btn" id="og-delete-crossed">
            <svg viewBox="0 0 24 24" width="20" height="20"><path fill="currentColor" d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>
            <span>Delete all crossed-off items</span>
          </button>
          <button class="og-crossed-action-btn" id="og-uncross-all">
            <svg viewBox="0 0 24 24" width="20" height="20"><path fill="currentColor" d="M12.5 8c-2.65 0-5.05.99-6.9 2.6L2 7v9h9l-3.62-3.62c1.39-1.16 3.16-1.88 5.12-1.88 3.54 0 6.55 2.31 7.6 5.5l2.37-.78C21.08 11.03 17.15 8 12.5 8z"/></svg>
            <span>Uncross-off all items</span>
          </button>
        </div>
      `;
    }
    crossedContainer.innerHTML = crossedHtml;

    // Bind crossed-off item name taps → uncross single item
    crossedContainer.querySelectorAll('.og-crossed-name').forEach(el => {
      el.addEventListener('click', (e) => {
        e.stopPropagation();
        const itemDiv = el.closest('.og-crossed-item');
        if (itemDiv) this._toggleCrossedOff(itemDiv.dataset.id, false);
      });
    });

    // Bind three-dot on crossed-off items
    crossedContainer.querySelectorAll('.og-item-menu-btn.crossed').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        this._showEditView(btn.dataset.id);
      });
    });

    // Bind crossed-off action buttons
    const deleteBtn = crossedContainer.querySelector('#og-delete-crossed');
    if (deleteBtn) deleteBtn.addEventListener('click', () => this._deleteCrossedOff());

    const uncrossBtn = crossedContainer.querySelector('#og-uncross-all');
    if (uncrossBtn) uncrossBtn.addEventListener('click', () => this._uncrossOffAll());
  }

  _groupByCategory(items) {
    const groups = {};
    for (const item of items) {
      const cat = this._masterCategories[item.name.trim().toLowerCase()] || (item.category_id && this._categoryIdMap[item.category_id]) || 'Uncategorized';
      if (!groups[cat]) groups[cat] = [];
      groups[cat].push(item);
    }
    return groups;
  }

  /* ---- Cross-off actions ---- */

  async _toggleCrossedOff(itemId, crossOff) {
    if (!this._currentListId) return;
    try {
      await this._ws('ourgroceries_kiosk/toggle_crossed_off', {
        list_id: this._currentListId, item_id: itemId, cross_off: crossOff,
      });
      // Update local state immediately
      const item = this._items.find(i => i.id === itemId);
      if (item) item.crossed_off = crossOff;
      this._renderListItems();
    } catch (err) {
      console.error('OG Kiosk: toggle crossed off failed', err);
    }
  }

  async _deleteCrossedOff() {
    if (!this._currentListId) return;
    try {
      await this._ws('ourgroceries_kiosk/delete_crossed_off', { list_id: this._currentListId });
      this._items = this._items.filter(i => !i.crossed_off);
      this._renderListItems();
    } catch (err) {
      console.error('OG Kiosk: delete crossed off failed', err);
    }
  }

  async _uncrossOffAll() {
    if (!this._currentListId) return;
    const crossed = this._items.filter(i => i.crossed_off);
    try {
      await Promise.all(crossed.map(item =>
        this._ws('ourgroceries_kiosk/toggle_crossed_off', {
          list_id: this._currentListId, item_id: item.id, cross_off: false,
        })
      ));
      crossed.forEach(item => { item.crossed_off = false; });
      this._renderListItems();
    } catch (err) {
      console.error('OG Kiosk: uncross all failed', err);
    }
  }

  /* ---- Add / Remove item ---- */

  async _addItem(name) {
    if (!this._currentListId) return;
    try {
      await this._ws('ourgroceries_kiosk/add_item', { list_id: this._currentListId, name });
      this._addToHistory(name);
      if (this._view === 'add') {
        this._showAddViewStatus(`Added "${name}"`);
        // Silently refresh items so "on list" indicators update
        try {
          const result = await this._ws('ourgroceries_kiosk/get_list_items', { list_id: this._currentListId });
          this._items = result.items || [];
          this._refreshAddViewItems();
        } catch (_) {}
      } else {
        this._showStatus(`Added "${name}"`, 'success');
        await this._refreshListItems();
      }
    } catch (err) {
      console.error('OG Kiosk: add item failed', err);
      if (this._view === 'add') {
        this._showAddViewStatus(`Failed to add "${name}"`);
      } else {
        this._showStatus(`Failed to add "${name}"`, 'error');
      }
    }
  }

  async _removeItem(itemId) {
    if (!this._currentListId) return;
    const item = this._items.find(i => i.id === itemId);
    const name = item ? item.name : 'item';
    try {
      await this._ws('ourgroceries_kiosk/remove_item', { list_id: this._currentListId, item_id: itemId });
      this._items = this._items.filter(i => i.id !== itemId);
      this._showStatus(`Removed "${name}"`, 'success');
      this._renderListItems();
    } catch (err) {
      console.error('OG Kiosk: remove failed', err);
      this._showStatus(`Failed to remove "${name}"`, 'error');
    }
  }

  /* ---- Add View ---- */

  _showAddView() {
    const root = this._getRoot();
    if (!root) return;
    this._view = 'add';

    // Render the header + input immediately so the view appears instantly
    root.innerHTML = `
      <div class="og-header og-add-header">
        <button class="og-header-back-btn" id="og-add-back" aria-label="Back">
          <svg viewBox="0 0 24 24" width="22" height="22"><path fill="currentColor" d="M15.41 7.41L14 6l-6 6 6 6 1.41-1.41L10.83 12z"/></svg>
        </button>
        <div class="og-add-input-wrapper">
          <input id="og-add-input" type="text" placeholder="Find or add item" autocomplete="off" autocorrect="on" autocapitalize="sentences" />
          <button id="og-add-clear" class="og-add-clear-btn hidden" aria-label="Clear">
            <svg viewBox="0 0 24 24" width="20" height="20"><path fill="currentColor" d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>
          </button>
        </div>
      </div>
      <div id="og-add-status" class="og-status hidden"></div>
      <div id="og-add-items" class="og-add-view-body"></div>
    `;

    this._bindAddViewEvents();

    // Auto-focus the input
    const input = root.querySelector('#og-add-input');
    if (input) setTimeout(() => input.focus(), 50);

    // Populate item list on next frame so the header paints immediately
    requestAnimationFrame(() => this._populateAddViewItems());
  }

  _populateAddViewItems() {
    const root = this._getRoot();
    if (!root || this._view !== 'add') return;
    const container = root.querySelector('#og-add-items');
    if (!container) return;

    const currentNamesLower = new Set(
      this._items.filter(i => !i.crossed_off).map(i => i.name.toLowerCase())
    );

    // Build deduplicated master item list
    const seen = new Set();
    const allItems = [];
    for (const name of this._masterItems) {
      const key = name.trim().toLowerCase();
      if (key && !seen.has(key)) {
        seen.add(key);
        allItems.push(name.trim());
      }
    }
    allItems.sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));

    let itemsHtml = '';
    for (const name of allItems) {
      const onList = currentNamesLower.has(name.toLowerCase());
      itemsHtml += `
        <button class="og-add-view-item" data-name="${this._escAttr(name)}">
          <div class="og-add-view-item-text">
            <span class="og-add-view-item-name">${this._escHtml(name)}</span>
            ${onList ? `<span class="og-add-view-on-list">On ${this._escHtml(this._currentListName)} list</span>` : ''}
          </div>
        </button>
      `;
    }

    container.innerHTML = itemsHtml;

    // Bind item taps
    container.querySelectorAll('.og-add-view-item').forEach(btn => {
      btn.addEventListener('click', () => {
        this._addItem(btn.dataset.name);
      });
    });
  }

  _bindAddViewEvents() {
    const root = this._getRoot();
    if (!root) return;

    const backBtn = root.querySelector('#og-add-back');
    if (backBtn) backBtn.addEventListener('click', async () => {
      // Refresh items before going back so list view is up to date
      try {
        const result = await this._ws('ourgroceries_kiosk/get_list_items', { list_id: this._currentListId });
        this._items = result.items || [];
      } catch (_) {}
      this._renderListView();
    });

    const input = root.querySelector('#og-add-input');
    const clearBtn = root.querySelector('#og-add-clear');

    if (input) {
      input.addEventListener('input', () => {
        const hasText = input.value.length > 0;
        if (clearBtn) clearBtn.classList.toggle('hidden', !hasText);
        this._filterAddViewItems(input.value.trim());
      });

      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          const name = input.value.trim();
          if (name) {
            this._addItem(name);
            input.value = '';
            if (clearBtn) clearBtn.classList.add('hidden');
            this._filterAddViewItems('');
          }
        }
      });
    }

    if (clearBtn) {
      clearBtn.addEventListener('click', () => {
        if (input) { input.value = ''; input.focus(); }
        clearBtn.classList.add('hidden');
        this._filterAddViewItems('');
      });
    }

  }

  _filterAddViewItems(query) {
    const root = this._getRoot();
    if (!root) return;
    const container = root.querySelector('#og-add-items');
    if (!container) return;

    const items = container.querySelectorAll('.og-add-view-item');
    const q = query.toLowerCase();

    if (!q) {
      items.forEach(item => { item.style.display = ''; });
      return;
    }

    items.forEach(item => {
      const name = item.dataset.name || '';
      const score = this._fuzzyScore(name, q);
      item.style.display = score > 0 ? '' : 'none';
    });
  }

  _refreshAddViewItems() {
    const root = this._getRoot();
    if (!root || this._view !== 'add') return;
    const container = root.querySelector('#og-add-items');
    if (!container) return;

    const currentNamesLower = new Set(
      this._items.filter(i => !i.crossed_off).map(i => i.name.toLowerCase())
    );

    container.querySelectorAll('.og-add-view-item').forEach(btn => {
      const name = btn.dataset.name || '';
      const onList = currentNamesLower.has(name.toLowerCase());
      const subtitle = btn.querySelector('.og-add-view-on-list');
      if (onList && !subtitle) {
        const textDiv = btn.querySelector('.og-add-view-item-text');
        if (textDiv) {
          const span = document.createElement('span');
          span.className = 'og-add-view-on-list';
          span.textContent = `On ${this._currentListName} list`;
          textDiv.appendChild(span);
        }
      } else if (!onList && subtitle) {
        subtitle.remove();
      }
    });
  }

  _showAddViewStatus(message) {
    const root = this._getRoot();
    const el = root && root.querySelector('#og-add-status');
    if (!el) return;
    if (this._statusTimeoutId) clearTimeout(this._statusTimeoutId);
    el.textContent = message;
    el.className = 'og-status success';
    this._statusTimeoutId = setTimeout(() => el.classList.add('hidden'), 2500);
  }

  /* ---- Edit View ---- */

  _showEditView(itemId) {
    const item = this._items.find(i => i.id === itemId);
    if (!item) return;
    this._editingItem = { ...item };
    this._editNameDirty = false;
    this._editItemCategory = this._masterCategories[item.name.trim().toLowerCase()] || (item.category_id && this._categoryIdMap[item.category_id]) || 'Uncategorized';
    this._renderEditView();
  }

  _renderEditView() {
    const root = this._getRoot();
    if (!root) return;
    this._view = 'edit';

    root.innerHTML = `
      <div class="og-edit-header">
        <button id="og-edit-back" class="og-edit-back-btn" aria-label="Back">
          <svg viewBox="0 0 24 24" width="20" height="20"><path fill="currentColor" d="M15.41 7.41L14 6l-6 6 6 6 1.41-1.41L10.83 12z"/></svg>
          <span>${this._escHtml(this._currentListName)}</span>
        </button>
        <span class="og-edit-header-center">Item Details</span>
        <button id="og-edit-delete" class="og-edit-delete-btn" aria-label="Delete">
          <svg viewBox="0 0 24 24" width="22" height="22"><path fill="currentColor" d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>
        </button>
      </div>
      <div class="og-edit-body">
        <input id="og-edit-name" class="og-edit-name-input" type="text" value="${this._escAttr(this._editingItem.name)}"
               autocomplete="off" autocorrect="on" autocapitalize="sentences" />
        <div class="og-edit-qty-row">
          <button id="og-less-btn" class="og-qty-btn">Fewer</button>
          <div class="og-qty-divider"></div>
          <button id="og-more-btn" class="og-qty-btn">More</button>
        </div>
        <button id="og-edit-cat-btn" class="og-edit-category-btn">
          <svg viewBox="0 0 24 24" width="20" height="20"><path fill="currentColor" d="M12 2l-5.5 9h11L12 2zm0 3.84L13.93 9h-3.87L12 5.84zM17.5 13c-2.49 0-4.5 2.01-4.5 4.5s2.01 4.5 4.5 4.5 4.5-2.01 4.5-4.5-2.01-4.5-4.5-4.5zm0 7c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5zM3 21.5h8v-8H3v8zm2-6h4v4H5v-4z"/></svg>
          <span>Category: </span>
          <span id="og-edit-cat-name" class="og-edit-cat-value">${this._escHtml(this._editItemCategory)}</span>
          <svg class="og-cat-chevron" viewBox="0 0 24 24" width="20" height="20"><path fill="currentColor" d="M10 6L8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z"/></svg>
        </button>
        ${this._editingItem.crossed_off ? `
          <button id="og-uncross-btn" class="og-uncross-single-btn">Mark as active</button>
        ` : ''}
      </div>
      <div id="og-confirm-overlay" class="confirm-overlay hidden">
        <div class="confirm-dialog">
          <p id="og-confirm-text"></p>
          <div class="confirm-buttons">
            <button id="og-confirm-cancel" class="confirm-btn cancel-btn">Cancel</button>
            <button id="og-confirm-remove" class="confirm-btn remove-btn">Remove</button>
          </div>
        </div>
      </div>
    `;

    this._bindEditViewEvents();
  }

  _bindEditViewEvents() {
    const root = this._getRoot();

    root.querySelector('#og-edit-back').addEventListener('click', () => this._handleEditBack());
    root.querySelector('#og-edit-delete').addEventListener('click', () => {
      if (this._editingItem) this._showConfirm(this._editingItem.id, this._editingItem.name);
    });

    const nameInput = root.querySelector('#og-edit-name');
    nameInput.addEventListener('input', () => { this._editNameDirty = true; });
    nameInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') nameInput.blur(); });
    nameInput.addEventListener('blur', () => {
      if (this._editNameDirty && this._editingItem) this._handleEditNameSave();
    });

    root.querySelector('#og-less-btn').addEventListener('click', () => this._handleQty(-1));
    root.querySelector('#og-more-btn').addEventListener('click', () => this._handleQty(1));
    root.querySelector('#og-edit-cat-btn').addEventListener('click', () => this._renderCategoryPicker());

    const uncrossBtn = root.querySelector('#og-uncross-btn');
    if (uncrossBtn) {
      uncrossBtn.addEventListener('click', async () => {
        await this._toggleCrossedOff(this._editingItem.id, false);
        this._editingItem.crossed_off = false;
        this._handleEditBack();
      });
    }

    // Confirm dialog
    root.querySelector('#og-confirm-cancel').addEventListener('click', () => this._hideConfirm());
    root.querySelector('#og-confirm-remove').addEventListener('click', () => {
      if (this._pendingRemoveId) this._removeItem(this._pendingRemoveId);
      this._hideConfirm();
      this._editingItem = null;
      this._renderListView();
    });
    root.querySelector('#og-confirm-overlay').addEventListener('click', (e) => {
      if (e.target.classList.contains('confirm-overlay')) this._hideConfirm();
    });
  }

  _handleEditBack() {
    if (this._editNameDirty && this._editingItem) this._handleEditNameSave();
    this._editingItem = null;
    this._renderListView();
  }

  async _handleEditNameSave() {
    if (!this._editingItem || !this._currentListId) return;
    const root = this._getRoot();
    const input = root.querySelector('#og-edit-name');
    const newName = input.value.trim();
    if (!newName || newName === this._editingItem.name) { this._editNameDirty = false; return; }

    try {
      await this._ws('ourgroceries_kiosk/update_item', {
        list_id: this._currentListId, item_id: this._editingItem.id, name: newName,
      });
      const localItem = this._items.find(i => i.id === this._editingItem.id);
      if (localItem) localItem.name = newName;
      this._editingItem.name = newName;
      this._editNameDirty = false;
    } catch (err) {
      console.error('OG Kiosk: rename failed', err);
    }
  }

  _parseQuantity(name) {
    const match = name.match(/^(.*?)\s+\((\d+)\)$/);
    if (match) return { baseName: match[1], quantity: parseInt(match[2], 10) };
    return { baseName: name, quantity: 1 };
  }

  _formatWithQuantity(baseName, qty) {
    return qty <= 1 ? baseName : `${baseName} (${qty})`;
  }

  async _handleQty(delta) {
    if (!this._editingItem || !this._currentListId) return;
    const root = this._getRoot();
    const input = root.querySelector('#og-edit-name');
    const currentName = input.value.trim();
    const { baseName, quantity } = this._parseQuantity(currentName);
    const newQty = quantity + delta;
    if (newQty < 1) return;
    const newName = this._formatWithQuantity(baseName, newQty);
    input.value = newName;
    this._editNameDirty = false;

    try {
      await this._ws('ourgroceries_kiosk/update_item', {
        list_id: this._currentListId, item_id: this._editingItem.id, name: newName,
      });
      const localItem = this._items.find(i => i.id === this._editingItem.id);
      if (localItem) localItem.name = newName;
      this._editingItem.name = newName;
    } catch (err) {
      console.error('OG Kiosk: quantity change failed', err);
      input.value = currentName;
    }
  }

  /* ---- Category Picker ---- */

  _renderCategoryPicker() {
    const root = this._getRoot();
    if (!root) return;
    this._view = 'categories';

    let categories = this._allCategories.length > 0
      ? [...this._allCategories]
      : [...new Set(Object.values(this._masterCategories))];
    categories.sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));
    if (!categories.includes('Uncategorized')) categories.push('Uncategorized');

    const currentCat = this._editItemCategory || 'Uncategorized';

    let html = `
      <div class="og-category-picker-header">
        <button id="og-cat-back" class="og-category-back-btn" aria-label="Back">
          <svg viewBox="0 0 24 24" width="20" height="20"><path fill="currentColor" d="M15.41 7.41L14 6l-6 6 6 6 1.41-1.41L10.83 12z"/></svg>
          <span>Back</span>
        </button>
        <span class="og-category-header-title">Categories</span>
        <span class="og-category-header-spacer"></span>
      </div>
      <div class="og-category-list">
    `;

    for (const cat of categories) {
      const selected = cat === currentCat;
      html += `
        <button class="og-category-item${selected ? ' selected' : ''}" data-category="${this._escAttr(cat)}">
          <span class="og-category-item-name">${this._escHtml(cat)}</span>
          ${selected ? '<svg class="og-category-check" viewBox="0 0 24 24" width="22" height="22"><path fill="currentColor" d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>' : ''}
        </button>
      `;
    }
    html += '</div>';
    root.innerHTML = html;

    root.querySelector('#og-cat-back').addEventListener('click', () => {
      this._renderEditView();
    });

    root.querySelectorAll('.og-category-item').forEach(btn => {
      btn.addEventListener('click', () => this._handleCategorySelect(btn.dataset.category));
    });
  }

  async _handleCategorySelect(categoryName) {
    if (!this._editingItem) return;
    const oldCategory = this._editItemCategory;
    this._editItemCategory = categoryName;

    const itemKey = this._editingItem.name.trim().toLowerCase();
    if (categoryName === 'Uncategorized') {
      delete this._masterCategories[itemKey];
    } else {
      this._masterCategories[itemKey] = categoryName;
    }

    this._renderEditView();

    try {
      await this._ws('ourgroceries_kiosk/set_item_category', {
        item_name: this._editingItem.name,
        category_name: categoryName === 'Uncategorized' ? '' : categoryName,
        list_id: this._currentListId || '',
      });
    } catch (err) {
      console.error('OG Kiosk: category change failed', err);
      if (oldCategory === 'Uncategorized') delete this._masterCategories[itemKey];
      else this._masterCategories[itemKey] = oldCategory;
      this._editItemCategory = oldCategory;
    }
  }

  /* ---- Confirm dialog ---- */

  _showConfirm(itemId, name) {
    this._pendingRemoveId = itemId;
    const root = this._getRoot();
    const overlay = root.querySelector('#og-confirm-overlay');
    const text = root.querySelector('#og-confirm-text');
    if (overlay && text) {
      text.textContent = `Remove "${name}"?`;
      overlay.classList.remove('hidden');
    }
  }

  _hideConfirm() {
    this._pendingRemoveId = null;
    const root = this._getRoot();
    const overlay = root && root.querySelector('#og-confirm-overlay');
    if (overlay) overlay.classList.add('hidden');
  }

  /* ---- Settings View ---- */

  _renderSettings() {
    const root = this._getRoot();
    if (!root) return;
    const prevView = this._view;
    this._view = 'settings';

    const isAdmin = !!(this._hass && this._hass.user && this._hass.user.is_admin);
    const hasPin = !!this._config.admin_pin;
    const showAdmin = isAdmin || this._settingsUnlocked;
    const themeKeys = ['system', ...Object.keys(THEMES)];

    let html = `
      <div class="og-header">
        <button class="og-header-back-btn" id="og-settings-back" aria-label="Back">
          <svg viewBox="0 0 24 24" width="22" height="22"><path fill="currentColor" d="M15.41 7.41L14 6l-6 6 6 6 1.41-1.41L10.83 12z"/></svg>
        </button>
        <span class="og-header-title">Settings</span>
        <span style="width:48px"></span>
      </div>
      <div class="og-settings-body">
        <div class="og-setting-section">
          <div class="og-setting-label">Theme</div>
          <div class="og-theme-grid">
    `;

    for (const key of themeKeys) {
      const t = key === 'system' ? _resolveTheme('system') : THEMES[key];
      const active = this._config.theme === key;
      html += `
        <button class="og-theme-swatch${active ? ' active' : ''}" data-theme="${key}" style="background:${t.headerBg};" title="${key}">
          ${active ? '<svg viewBox="0 0 24 24" width="18" height="18"><path fill="white" d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>' : ''}
        </button>
      `;
    }

    html += `
          </div>
        </div>
    `;

    if (showAdmin) {
      // --- Admin list settings ---
      html += `
        <div class="og-setting-section">
          <div class="og-setting-label">List Mode</div>
          <div class="og-setting-row">
            <button class="og-setting-option${this._config.list_mode !== 'single' ? ' active' : ''}" data-mode="all">All lists</button>
            <button class="og-setting-option${this._config.list_mode === 'single' ? ' active' : ''}" data-mode="single">Single list</button>
          </div>
        </div>
        <div class="og-setting-section" id="og-list-select-section" style="${this._config.list_mode === 'single' ? '' : 'display:none'}">
          <div class="og-setting-label">Locked List</div>
          <div class="og-setting-list-options">
      `;

      for (const list of this._lists) {
        const active = this._config.locked_list && list.name.toLowerCase() === this._config.locked_list.toLowerCase();
        html += `<button class="og-setting-list-option${active ? ' active' : ''}" data-list-name="${this._escAttr(list.name)}">${this._escHtml(list.name)}</button>`;
      }

      html += `
          </div>
        </div>
        <div class="og-setting-section" id="og-default-list-section" style="${this._config.list_mode !== 'single' ? '' : 'display:none'}">
          <div class="og-setting-label">Default List (optional)</div>
          <div class="og-setting-list-options">
            <button class="og-setting-list-option${!this._config.default_list ? ' active' : ''}" data-list-name="">None</button>
      `;

      for (const list of this._lists) {
        const active = this._config.default_list && list.name.toLowerCase() === this._config.default_list.toLowerCase();
        html += `<button class="og-setting-list-option${active ? ' active' : ''}" data-list-name="${this._escAttr(list.name)}">${this._escHtml(list.name)}</button>`;
      }

      html += `
          </div>
        </div>
      `;
    } else {
      // --- Non-admin: show PIN unlock ---
      html += `
        <div class="og-setting-section">
          <div class="og-setting-label">List Settings</div>
          ${hasPin ? `
            <div class="og-pin-unlock">
              <svg viewBox="0 0 24 24" width="32" height="32" style="color:var(--crossed-off-text)"><path fill="currentColor" d="M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zm-6 9c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zm3.1-9H8.9V6c0-1.71 1.39-3.1 3.1-3.1s3.1 1.39 3.1 3.1v2z"/></svg>
              <div class="og-pin-entry">
                <input type="password" inputmode="numeric" pattern="[0-9]*" maxlength="8" id="og-pin-input" class="og-pin-input" placeholder="Enter PIN" autocomplete="off">
                <button class="og-pin-submit" id="og-pin-submit">Unlock</button>
              </div>
              <div class="og-pin-error" id="og-pin-error" style="display:none">Incorrect PIN</div>
            </div>
          ` : `
            <div class="og-pin-no-access">
              <svg viewBox="0 0 24 24" width="32" height="32" style="color:var(--crossed-off-text)"><path fill="currentColor" d="M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zm-6 9c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zm3.1-9H8.9V6c0-1.71 1.39-3.1 3.1-3.1s3.1 1.39 3.1 3.1v2z"/></svg>
              <span>An admin must configure list settings.</span>
            </div>
          `}
        </div>
      `;
    }

    html += `
      </div>
    `;

    root.innerHTML = html;

    root.querySelector('#og-settings-back').addEventListener('click', async () => {
      // Admin/unlocked selecting single mode must pick a locked list before leaving
      if (showAdmin && this._config.list_mode === 'single' && !this._config.locked_list) {
        const section = root.querySelector('#og-list-select-section');
        if (section) {
          section.style.display = '';
          section.scrollIntoView({ behavior: 'smooth' });
          section.classList.add('og-setting-highlight');
          setTimeout(() => section.classList.remove('og-setting-highlight'), 1500);
        }
        return;
      }

      // Clear PIN unlock when leaving settings
      this._settingsUnlocked = false;

      // Single-list mode: always navigate to the locked list
      if (this._config.list_mode === 'single' && this._config.locked_list) {
        await this._navigateToListByName(this._config.locked_list);
      } else if (prevView === 'list' && this._currentListId) {
        this._renderListView();
      } else {
        this._renderLists();
      }
    });

    // Theme swatches
    root.querySelectorAll('.og-theme-swatch').forEach(btn => {
      btn.addEventListener('click', () => {
        this._config.theme = btn.dataset.theme;
        this._applyTheme();
        this._saveLocalConfig();
        this._renderSettings();
      });
    });

    if (showAdmin) {
      // List mode
      root.querySelectorAll('.og-setting-option').forEach(btn => {
        btn.addEventListener('click', () => {
          this._config.list_mode = btn.dataset.mode;
          this._saveLocalConfig();
          this._renderSettings();
        });
      });

      // Locked list / default list
      const listSelectSection = root.querySelector('#og-list-select-section');
      const defaultListSection = root.querySelector('#og-default-list-section');

      if (listSelectSection) {
        listSelectSection.querySelectorAll('.og-setting-list-option').forEach(btn => {
          btn.addEventListener('click', () => {
            this._config.locked_list = btn.dataset.listName;
            this._saveLocalConfig();
            this._renderSettings();
          });
        });
      }

      if (defaultListSection) {
        defaultListSection.querySelectorAll('.og-setting-list-option').forEach(btn => {
          btn.addEventListener('click', () => {
            this._config.default_list = btn.dataset.listName;
            this._saveLocalConfig();
            this._renderSettings();
          });
        });
      }

    } else {
      // PIN unlock for non-admin
      const pinInput = root.querySelector('#og-pin-input');
      const pinSubmit = root.querySelector('#og-pin-submit');
      const pinError = root.querySelector('#og-pin-error');

      const tryUnlock = () => {
        if (pinInput && this._config.admin_pin && pinInput.value === this._config.admin_pin) {
          this._settingsUnlocked = true;
          this._renderSettings();
        } else if (pinError) {
          pinError.style.display = '';
          if (pinInput) { pinInput.value = ''; pinInput.focus(); }
        }
      };

      if (pinSubmit) pinSubmit.addEventListener('click', tryUnlock);
      if (pinInput) pinInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') tryUnlock(); });
    }
  }

  /* ---- First-run Wizard ---- */

  _renderWizard() {
    const root = this._getRoot();
    if (!root) return;
    this._view = 'wizard';

    if (this._wizardStep === 1) {
      const themeKeys = ['system', ...Object.keys(THEMES)];
      let html = `
        <div class="og-wizard">
          <div class="og-wizard-title">Choose a Theme</div>
          <div class="og-theme-grid large">
      `;
      for (const key of themeKeys) {
        const t = key === 'system' ? _resolveTheme('system') : THEMES[key];
        html += `
          <button class="og-theme-swatch large" data-theme="${key}" style="background:${t.headerBg};" title="${key}">
            <span class="og-swatch-label">${key}</span>
          </button>
        `;
      }
      html += '</div></div>';
      root.innerHTML = html;

      root.querySelectorAll('.og-theme-swatch').forEach(btn => {
        btn.addEventListener('click', () => {
          this._config.theme = btn.dataset.theme;
          this._applyTheme();
          this._wizardStep = 2;
          this._renderWizard();
        });
      });

    } else if (this._wizardStep === 2) {
      root.innerHTML = `
        <div class="og-wizard">
          <div class="og-wizard-title">List Mode</div>
          <button class="og-wizard-choice" data-mode="all">
            <strong>All Lists</strong>
            <span>Browse and switch between all your OurGroceries lists</span>
          </button>
          <button class="og-wizard-choice" data-mode="single">
            <strong>Single List</strong>
            <span>Lock the card to one specific list</span>
          </button>
        </div>
      `;

      root.querySelectorAll('.og-wizard-choice').forEach(btn => {
        btn.addEventListener('click', () => {
          this._config.list_mode = btn.dataset.mode;
          this._wizardStep = 3;
          this._renderWizard();
        });
      });

    } else if (this._wizardStep === 3) {
      const isSingle = this._config.list_mode === 'single';
      let html = `
        <div class="og-wizard">
          <div class="og-wizard-title">${isSingle ? 'Choose Your List' : 'Default List (optional)'}</div>
      `;

      if (!isSingle) {
        html += `<button class="og-wizard-list-option" data-name="">Skip — show all lists</button>`;
      }

      for (const list of this._lists) {
        html += `<button class="og-wizard-list-option" data-name="${this._escAttr(list.name)}">${this._escHtml(list.name)}</button>`;
      }
      html += '</div>';
      root.innerHTML = html;

      root.querySelectorAll('.og-wizard-list-option').forEach(btn => {
        btn.addEventListener('click', () => {
          if (isSingle) {
            this._config.locked_list = btn.dataset.name;
          } else {
            this._config.default_list = btn.dataset.name;
          }
          this._fireConfigChanged();
          this._initialLoad();
        });
      });
    }
  }

  _fireConfigChanged() {
    const ev = new CustomEvent('config-changed', {
      detail: { config: { ...this._config } },
      bubbles: true, composed: true,
    });
    this.dispatchEvent(ev);
  }

  _saveLocalConfig() {
    try {
      localStorage.setItem('og-kiosk-device-config', JSON.stringify({
        theme: this._config.theme,
        list_mode: this._config.list_mode,
        locked_list: this._config.locked_list,
        default_list: this._config.default_list,
      }));
    } catch (_) { /* localStorage full or unavailable */ }
  }

  /* ---- Autocomplete ---- */

  _updateAutocomplete() {
    const root = this._getRoot();
    const input = root && root.querySelector('#og-input');
    const dropdown = root && root.querySelector('#og-autocomplete');
    if (!input || !dropdown) return;

    const query = input.value.trim().toLowerCase();
    const candidates = query.length < 1 ? this._getRecentCandidates() : this._getAutocompleteCandidates(query);

    if (candidates.length === 0) { this._hideAutocomplete(); return; }

    this._autocompleteIdx = -1;
    dropdown.innerHTML = '';

    const currentNamesLower = new Set(
      this._items.filter(i => !i.crossed_off).map(i => i.name.toLowerCase())
    );

    candidates.slice(0, 10).forEach(c => {
      const div = document.createElement('div');
      div.className = 'ac-item';
      const onList = currentNamesLower.has(c.text.toLowerCase());
      let html = query.length > 0 ? this._highlightMatch(c.text, query) : this._escHtml(c.text);
      if (onList) html += '<span class="ac-on-list">(on list)</span>';
      div.innerHTML = html;
      div.addEventListener('click', () => {
        input.value = c.text;
        this._hideAutocomplete();
        this._addItem(c.text);
        input.value = '';
      });
      dropdown.appendChild(div);
    });
    dropdown.classList.add('open');
  }

  _hideAutocomplete() {
    const root = this._getRoot();
    const dropdown = root && root.querySelector('#og-autocomplete');
    if (dropdown) { dropdown.classList.remove('open'); dropdown.innerHTML = ''; }
    this._autocompleteIdx = -1;
  }

  _moveAutocomplete(dir) {
    const root = this._getRoot();
    const dropdown = root && root.querySelector('#og-autocomplete');
    if (!dropdown) return;
    const items = dropdown.querySelectorAll('.ac-item');
    if (items.length === 0) return;
    items.forEach(it => it.classList.remove('highlighted'));
    this._autocompleteIdx += dir;
    if (this._autocompleteIdx < 0) this._autocompleteIdx = items.length - 1;
    if (this._autocompleteIdx >= items.length) this._autocompleteIdx = 0;
    items[this._autocompleteIdx].classList.add('highlighted');
    items[this._autocompleteIdx].scrollIntoView({ block: 'nearest' });
  }

  _getAutocompleteCandidates(query) {
    const pool = this._buildAutocompletePool();
    const scored = [];
    for (const entry of pool) {
      const score = this._fuzzyScore(entry.text, query);
      if (score > 0) scored.push({ text: entry.text, score });
    }
    scored.sort((a, b) => b.score - a.score);
    return scored;
  }

  _getRecentCandidates() {
    const history = this._getHistory();
    const seen = new Set();
    const results = [];
    for (const h of history) {
      const key = h.toLowerCase();
      if (!seen.has(key)) { seen.add(key); results.push({ text: h }); }
    }
    return results;
  }

  _buildAutocompletePool() {
    const history = this._getHistory();
    const historyDisplay = {};
    for (const h of history) { const key = h.toLowerCase(); if (!historyDisplay[key]) historyDisplay[key] = h; }

    const seenBase = new Set();
    const pool = [];
    const addEntry = (display) => {
      const base = this._parseQuantity(display).baseName.toLowerCase();
      if (seenBase.has(base)) return;
      seenBase.add(base);
      pool.push({ text: display });
    };

    for (const item of this._items) {
      if (!item.crossed_off) addEntry(this._parseQuantity(item.name.trim()).baseName);
    }
    for (const key of Object.keys(this._masterCategories)) {
      addEntry(historyDisplay[key] || this._titleCase(key));
    }
    for (const h of history) addEntry(h);
    return pool;
  }

  _fuzzyScore(text, query) {
    const lower = text.toLowerCase();
    if (lower.startsWith(query)) return 100 + (1 / text.length);
    const words = lower.split(/\s+/);
    for (const w of words) { if (w.startsWith(query)) return 80 + (1 / text.length); }
    if (lower.includes(query)) return 60 + (1 / text.length);
    let qi = 0;
    for (let i = 0; i < lower.length && qi < query.length; i++) { if (lower[i] === query[qi]) qi++; }
    if (qi === query.length) return 20 + (qi / text.length);
    return 0;
  }

  _highlightMatch(text, query) {
    const idx = text.toLowerCase().indexOf(query);
    if (idx >= 0) {
      return this._escHtml(text.slice(0, idx)) + '<span class="ac-match">' +
        this._escHtml(text.slice(idx, idx + query.length)) + '</span>' +
        this._escHtml(text.slice(idx + query.length));
    }
    return this._escHtml(text);
  }

  _titleCase(str) { return str.replace(/\b\w/g, c => c.toUpperCase()); }

  /* ---- History ---- */

  _getHistory() {
    try { const raw = localStorage.getItem(this._HISTORY_KEY); if (raw) return JSON.parse(raw); } catch (e) {}
    return [];
  }

  _addToHistory(item) {
    if (!item) return;
    const trimmed = item.trim();
    if (!trimmed) return;
    try {
      let history = this._getHistory();
      history = history.filter(h => h.toLowerCase() !== trimmed.toLowerCase());
      history.unshift(trimmed);
      if (history.length > this._MAX_HISTORY) history = history.slice(0, this._MAX_HISTORY);
      localStorage.setItem(this._HISTORY_KEY, JSON.stringify(history));
    } catch (e) {}
  }

  /* ---- Status message ---- */

  _showStatus(message, type = 'success') {
    const root = this._getRoot();
    const el = root && root.querySelector('#og-status');
    if (!el) return;
    if (this._statusTimeoutId) clearTimeout(this._statusTimeoutId);
    el.textContent = message;
    el.className = 'og-status ' + type;
    this._statusTimeoutId = setTimeout(() => el.classList.add('hidden'), 2500);
  }

  /* ---- Utils ---- */

  _escHtml(str) {
    const div = document.createElement('div');
    div.textContent = str || '';
    return div.innerHTML;
  }

  _escAttr(str) {
    return (str || '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/'/g, '&#39;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  /* ---- Styles ---- */

  _buildStyles() {
    return `
      :host {
        --header-bg: #81a51d;
        --category-bg: #d3bb19;
        --page-bg: #fdf8e8;
        --item-bg: #fff8e8;
        --text-primary: #333333;
        --text-on-accent: #ffffff;
        --accent-color: #81a51d;
        --crossed-off-bg: #f5f0d8;
        --crossed-off-text: #888888;
        --badge-bg: #81a51d;
        --divider-color: rgba(0,0,0,0.08);
        --overlay-bg: rgba(0,0,0,0.45);

        display: block;
        touch-action: manipulation;
        -webkit-tap-highlight-color: transparent;
        user-select: none;
        -webkit-user-select: none;
      }

      ha-card {
        position: relative;
        overflow: hidden;
        border-radius: var(--ha-card-border-radius, 12px);
        background: var(--page-bg);
        color: var(--text-primary);
        box-shadow: 0 2px 8px rgba(0,0,0,0.12);
      }

      .hidden { display: none !important; }

      .og-root {
        display: flex;
        flex-direction: column;
        min-height: 200px;
      }

      /* ---- Header ---- */
      .og-header {
        background: var(--header-bg);
        padding: 16px 20px;
        display: flex;
        align-items: center;
        gap: 8px;
      }
      .og-header-title {
        flex: 1;
        font-size: 26px;
        font-weight: 700;
        color: var(--text-on-accent);
        letter-spacing: -0.3px;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .og-header-back-btn {
        width: 40px; height: 40px; min-width: 40px;
        border: none; border-radius: 50%;
        background: rgba(255,255,255,0.15);
        color: var(--text-on-accent);
        cursor: pointer; display: flex; align-items: center; justify-content: center;
        touch-action: manipulation;
      }
      .og-header-back-btn:active { background: rgba(255,255,255,0.3); }
      .og-header-icon-btn {
        width: 40px; height: 40px; min-width: 40px;
        border: none; border-radius: 50%;
        background: rgba(255,255,255,0.15);
        color: var(--text-on-accent);
        cursor: pointer; display: flex; align-items: center; justify-content: center;
        touch-action: manipulation;
      }
      .og-header-icon-btn:active { background: rgba(255,255,255,0.3); }

      /* ---- List of Lists ---- */
      .og-lists-container {
        max-height: 75vh;
        overflow-y: auto;
        -webkit-overflow-scrolling: touch;
      }
      .og-list-row {
        display: flex; align-items: center;
        width: 100%; box-sizing: border-box;
        padding: 16px 20px;
        border: none; border-bottom: 1px solid var(--divider-color);
        background: var(--item-bg);
        text-align: left; font-size: 20px;
        color: var(--text-primary);
        cursor: pointer; touch-action: manipulation;
        transition: background 0.15s;
      }
      .og-list-row:active { opacity: 0.7; }
      .og-list-row-name { flex: 1; }
      .og-list-row-badge {
        background: var(--badge-bg);
        color: var(--text-on-accent);
        font-size: 14px; font-weight: 700;
        min-width: 28px; height: 28px;
        border-radius: 14px;
        display: flex; align-items: center; justify-content: center;
        padding: 0 8px;
      }

      /* ---- List view items ---- */
      .og-list-view-body {
        display: flex; flex-direction: column;
        max-height: 75vh;
        overflow-y: auto;
        -webkit-overflow-scrolling: touch;
      }
      .og-items-container { display: flex; flex-direction: column; }
      .og-category-bar {
        background: var(--category-bg);
        padding: 4px 16px;
        font-size: 17px; font-weight: 700;
        color: var(--text-on-accent);
        letter-spacing: 0.2px;
      }
      .og-item {
        display: flex; align-items: center;
        padding: 14px 16px;
        background: var(--item-bg);
        border-bottom: 1px solid var(--divider-color);
        min-height: 48px;
      }
      .og-item-name {
        flex: 1;
        font-size: 21px; line-height: 1.3;
        word-break: break-word;
        color: var(--text-primary);
        cursor: pointer;
      }
      .og-item-menu-btn {
        width: 44px; height: 44px; min-width: 44px;
        border: none; border-radius: 50%;
        background: transparent;
        color: var(--accent-color);
        cursor: pointer; display: flex; align-items: center; justify-content: center;
        touch-action: manipulation;
      }
      .og-item-menu-btn:active { background: rgba(0,0,0,0.05); }

      /* ---- Add item row (in list view) ---- */
      .og-add-item-row {
        display: flex; gap: 8px; align-items: center;
        padding: 12px 16px;
        background: var(--page-bg);
        border-bottom: 1px solid var(--divider-color);
        position: sticky; top: 0; z-index: 10;
      }
      .og-input-wrapper { flex: 1; position: relative; }
      .og-add-item-row input {
        width: 100%; box-sizing: border-box;
        height: 48px; padding: 0 14px;
        border: 2px solid var(--divider-color);
        border-radius: 8px;
        background: var(--item-bg);
        color: var(--text-primary);
        font-size: 18px; outline: none;
        cursor: pointer;
      }
      .og-add-item-row input::placeholder { color: var(--crossed-off-text); opacity: 0.8; }
      .og-add-btn {
        width: 48px; height: 48px; min-width: 48px;
        border: none; border-radius: 8px;
        background: var(--accent-color);
        color: var(--text-on-accent);
        cursor: pointer; display: flex; align-items: center; justify-content: center;
        touch-action: manipulation;
      }
      .og-add-btn:active { opacity: 0.7; }
      .og-add-item-row.og-tapped input { border-color: var(--accent-color); }
      .og-add-item-row.og-tapped .og-add-btn { opacity: 0.7; }

      /* ---- Add view ---- */
      .og-add-header {
        gap: 8px;
      }
      .og-add-input-wrapper {
        flex: 1; position: relative;
        display: flex; align-items: center;
      }
      .og-add-input-wrapper input {
        width: 100%; box-sizing: border-box;
        height: 42px; padding: 0 36px 0 12px;
        border: none; border-radius: 8px;
        background: rgba(255,255,255,0.2);
        color: var(--text-on-accent);
        font-size: 18px; outline: none;
      }
      .og-add-input-wrapper input::placeholder {
        color: rgba(255,255,255,0.7);
      }
      .og-add-clear-btn {
        position: absolute; right: 4px; top: 50%; transform: translateY(-50%);
        width: 32px; height: 32px; border: none; border-radius: 50%;
        background: transparent; color: rgba(255,255,255,0.7);
        cursor: pointer; display: flex; align-items: center; justify-content: center;
        touch-action: manipulation;
      }
      .og-add-clear-btn:active { opacity: 0.7; }
      .og-add-view-body {
        max-height: 75vh; overflow-y: auto;
        -webkit-overflow-scrolling: touch;
        display: flex; flex-direction: column;
      }
      .og-add-view-item {
        display: flex; align-items: center;
        width: 100%; box-sizing: border-box;
        padding: 14px 16px;
        border: none; border-bottom: 1px solid var(--divider-color);
        background: var(--item-bg);
        text-align: left;
        cursor: pointer; touch-action: manipulation;
        color: var(--text-primary);
      }
      .og-add-view-item:active { opacity: 0.7; }
      .og-add-view-item-text {
        display: flex; flex-direction: column; gap: 2px;
      }
      .og-add-view-item-name {
        font-size: 20px; line-height: 1.3;
      }
      .og-add-view-on-list {
        font-size: 14px; color: var(--crossed-off-text);
      }

      /* ---- Crossed-off items ---- */
      .og-crossed-container {
        display: flex; flex-direction: column;
        background: var(--crossed-off-bg);
      }
      .og-crossed-item {
        display: flex; align-items: center;
        padding: 12px 16px;
        border-bottom: 1px solid var(--divider-color);
      }
      .og-crossed-name {
        flex: 1;
        font-size: 20px; line-height: 1.3;
        text-decoration: line-through;
        color: var(--crossed-off-text);
        cursor: pointer;
      }
      .og-item-menu-btn.crossed { color: var(--crossed-off-text); }

      /* ---- Crossed-off action buttons ---- */
      .og-crossed-actions {
        display: flex; flex-direction: column;
        background: var(--crossed-off-bg);
        padding: 8px 16px 16px;
      }
      .og-crossed-action-btn {
        display: flex; align-items: center; gap: 10px;
        width: 100%; box-sizing: border-box;
        padding: 14px 16px;
        border: none; border-radius: 8px;
        background: rgba(0,0,0,0.04);
        font-size: 16px; cursor: pointer;
        touch-action: manipulation;
        color: var(--accent-color);
        margin-top: 8px;
      }
      .og-crossed-action-btn:active { opacity: 0.7; }

      /* ---- Autocomplete ---- */
      .autocomplete-dropdown {
        position: absolute; top: 100%; left: 0; right: 0; z-index: 10;
        background: var(--item-bg);
        border: 1px solid var(--divider-color);
        border-radius: 0 0 8px 8px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.12);
        max-height: 280px; overflow-y: auto;
        display: none;
      }
      .autocomplete-dropdown.open { display: block; }
      .ac-item {
        padding: 12px 14px; font-size: 17px;
        cursor: pointer; border-bottom: 1px solid var(--divider-color);
        color: var(--text-primary);
        touch-action: manipulation;
      }
      .ac-item:last-child { border-bottom: none; }
      .ac-item:active, .ac-item.highlighted { background: rgba(0,0,0,0.05); }
      .ac-item .ac-match { font-weight: 700; }
      .ac-item .ac-on-list { font-size: 12px; color: var(--crossed-off-text); margin-left: 8px; }

      /* ---- Status ---- */
      .og-status {
        padding: 6px 16px; font-size: 14px; text-align: center;
      }
      .og-status.success { color: #4caf50; }
      .og-status.error { color: #d44; }

      /* ---- Empty state ---- */
      .og-empty {
        padding: 40px 16px; text-align: center;
        color: var(--crossed-off-text); font-size: 17px;
      }

      /* ---- Edit view ---- */
      .og-edit-header {
        background: var(--page-bg);
        padding: 14px 16px;
        display: flex; align-items: center;
        border-bottom: 1px solid var(--divider-color);
        min-height: 52px;
      }
      .og-edit-back-btn {
        border: none; background: transparent;
        color: var(--accent-color);
        cursor: pointer; display: flex; align-items: center; gap: 2px;
        font-size: 17px; font-weight: 500;
        padding: 8px 4px; touch-action: manipulation;
        white-space: nowrap;
      }
      .og-edit-back-btn:active { opacity: 0.6; }
      .og-edit-header-center {
        flex: 1; text-align: center;
        font-size: 18px; font-weight: 700;
        color: var(--text-primary);
      }
      .og-edit-delete-btn {
        width: 44px; height: 44px; min-width: 44px;
        border: none; border-radius: 8px;
        background: transparent; color: var(--accent-color);
        cursor: pointer; display: flex; align-items: center; justify-content: center;
        touch-action: manipulation;
      }
      .og-edit-delete-btn:active { opacity: 0.6; }
      .og-edit-body {
        padding: 20px 16px;
        display: flex; flex-direction: column; gap: 16px;
      }
      .og-edit-name-input {
        width: 100%; box-sizing: border-box;
        height: 52px; padding: 0 14px;
        border: 1px solid var(--divider-color);
        border-radius: 8px; background: var(--item-bg);
        color: var(--text-primary); font-size: 18px;
        outline: none;
      }
      .og-edit-name-input:focus { border-color: var(--accent-color); }
      .og-edit-qty-row {
        display: flex; align-items: center;
        align-self: flex-start;
        border: 2px solid var(--accent-color);
        border-radius: 8px; overflow: hidden;
      }
      .og-qty-btn {
        border: none; background: transparent;
        color: var(--accent-color);
        font-size: 17px; font-weight: 600;
        padding: 10px 24px; cursor: pointer;
        touch-action: manipulation;
      }
      .og-qty-btn:active { background: rgba(0,0,0,0.05); }
      .og-qty-divider { width: 2px; height: 24px; background: var(--accent-color); }
      .og-edit-category-btn {
        display: flex; align-items: center; gap: 8px;
        width: 100%; box-sizing: border-box;
        padding: 14px; border: 1px solid var(--divider-color);
        border-radius: 8px; background: var(--item-bg);
        color: var(--accent-color); font-size: 17px;
        cursor: pointer; touch-action: manipulation;
        text-align: left;
      }
      .og-edit-category-btn:active { opacity: 0.7; }
      .og-edit-cat-value { font-weight: 600; }
      .og-cat-chevron { margin-left: auto; flex-shrink: 0; opacity: 0.5; }
      .og-uncross-single-btn {
        width: 100%; padding: 14px; border: 2px solid var(--accent-color);
        border-radius: 8px; background: transparent;
        color: var(--accent-color); font-size: 17px; font-weight: 600;
        cursor: pointer; touch-action: manipulation;
      }
      .og-uncross-single-btn:active { opacity: 0.7; }

      /* ---- Category picker ---- */
      .og-category-picker-header {
        background: var(--header-bg);
        padding: 14px 16px;
        display: flex; align-items: center;
        min-height: 52px;
      }
      .og-category-back-btn {
        border: none; background: transparent;
        color: var(--text-on-accent);
        cursor: pointer; display: flex; align-items: center; gap: 2px;
        font-size: 17px; font-weight: 500;
        padding: 8px 4px; touch-action: manipulation;
      }
      .og-category-back-btn:active { opacity: 0.7; }
      .og-category-header-title {
        flex: 1; text-align: center;
        font-size: 20px; font-weight: 700;
        color: var(--text-on-accent);
      }
      .og-category-header-spacer { width: 60px; }
      .og-category-list {
        max-height: 70vh; overflow-y: auto;
        -webkit-overflow-scrolling: touch;
      }
      .og-category-item {
        display: flex; align-items: center;
        width: 100%; box-sizing: border-box;
        padding: 16px 20px;
        border: none; border-bottom: 1px solid var(--divider-color);
        background: var(--item-bg);
        text-align: left; font-size: 18px;
        color: var(--text-primary);
        cursor: pointer; touch-action: manipulation;
      }
      .og-category-item:active { opacity: 0.7; }
      .og-category-item-name { flex: 1; }
      .og-category-check { color: var(--accent-color); flex-shrink: 0; }

      /* ---- Confirm dialog ---- */
      .confirm-overlay {
        position: absolute; inset: 0; z-index: 200;
        background: var(--overlay-bg);
        display: flex; align-items: center; justify-content: center;
        padding: 24px;
      }
      .confirm-dialog {
        background: var(--item-bg);
        border-radius: 12px; padding: 24px;
        max-width: 340px; width: 100%;
        box-shadow: 0 8px 32px rgba(0,0,0,0.25);
      }
      .confirm-dialog p {
        font-size: 18px; margin: 0 0 20px; line-height: 1.4;
        color: var(--text-primary);
      }
      .confirm-buttons { display: flex; gap: 12px; }
      .confirm-btn {
        flex: 1; height: 50px; border: none; border-radius: 8px;
        font-size: 17px; font-weight: 600;
        cursor: pointer; touch-action: manipulation;
      }
      .confirm-btn:active { opacity: 0.7; }
      .cancel-btn { background: rgba(0,0,0,0.08); color: var(--text-primary); }
      .remove-btn { background: #d44; color: #fff; }

      /* ---- Settings ---- */
      .og-settings-body {
        padding: 16px;
        max-height: 70vh; overflow-y: auto;
      }
      .og-setting-section { margin-bottom: 24px; transition: background 0.3s; border-radius: 8px; }
      .og-setting-highlight { background: rgba(var(--rgb-accent-color, 255,165,0), 0.15); padding: 8px; margin-left: -8px; margin-right: -8px; }
      @keyframes og-pulse { 0%,100% { opacity: 1; } 50% { opacity: 0.5; } }
      .og-setting-highlight .og-setting-label { animation: og-pulse 0.5s ease-in-out 2; }
      .og-setting-label {
        font-size: 14px; font-weight: 600;
        text-transform: uppercase; letter-spacing: 0.5px;
        color: var(--crossed-off-text);
        margin-bottom: 10px;
      }
      .og-theme-grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(44px, 1fr));
        gap: 8px;
      }
      .og-theme-grid.large {
        grid-template-columns: repeat(auto-fill, minmax(80px, 1fr));
        gap: 12px; padding: 0 16px;
      }
      .og-theme-swatch {
        width: 100%; aspect-ratio: 1;
        border: 3px solid transparent; border-radius: 10px;
        cursor: pointer; touch-action: manipulation;
        display: flex; align-items: center; justify-content: center;
        transition: border-color 0.2s;
      }
      .og-theme-swatch:active { opacity: 0.7; }
      .og-theme-swatch.active { border-color: var(--text-primary); }
      .og-theme-swatch.large {
        aspect-ratio: auto; min-height: 60px;
        flex-direction: column; gap: 4px;
      }
      .og-swatch-label {
        color: #fff; font-size: 11px; font-weight: 600;
        text-shadow: 0 1px 2px rgba(0,0,0,0.4);
      }
      .og-setting-row { display: flex; gap: 8px; }
      .og-setting-option {
        flex: 1; padding: 12px; border: 2px solid var(--divider-color);
        border-radius: 8px; background: var(--item-bg);
        color: var(--text-primary); font-size: 16px; font-weight: 500;
        cursor: pointer; touch-action: manipulation;
        text-align: center;
      }
      .og-setting-option.active { border-color: var(--accent-color); color: var(--accent-color); font-weight: 700; }
      .og-setting-option:active { opacity: 0.7; }
      .og-setting-list-options { display: flex; flex-direction: column; gap: 4px; }
      .og-setting-list-option {
        padding: 12px 16px; border: 1px solid var(--divider-color);
        border-radius: 8px; background: var(--item-bg);
        color: var(--text-primary); font-size: 16px;
        cursor: pointer; touch-action: manipulation;
        text-align: left;
      }
      .og-setting-list-option.active { border-color: var(--accent-color); color: var(--accent-color); font-weight: 600; }
      .og-setting-list-option:active { opacity: 0.7; }

      /* ---- PIN ---- */
      .og-pin-unlock, .og-pin-no-access {
        display: flex; flex-direction: column; align-items: center;
        gap: 12px; padding: 20px; text-align: center;
        color: var(--crossed-off-text); font-size: 15px;
      }
      .og-pin-entry { display: flex; gap: 8px; width: 100%; max-width: 280px; }
      .og-pin-input {
        flex: 1; padding: 12px; border: 2px solid var(--divider-color);
        border-radius: 8px; background: var(--item-bg); color: var(--text-primary);
        font-size: 20px; text-align: center; letter-spacing: 4px;
        outline: none;
      }
      .og-pin-input:focus { border-color: var(--accent-color); }
      .og-pin-submit {
        padding: 12px 20px; border: none; border-radius: 8px;
        background: var(--accent-color); color: #fff;
        font-size: 16px; font-weight: 600;
        cursor: pointer; touch-action: manipulation;
      }
      .og-pin-submit:active { opacity: 0.7; }
      .og-pin-error { color: #d44; font-size: 14px; font-weight: 500; }

      /* ---- Wizard ---- */
      .og-wizard {
        padding: 24px 16px;
        display: flex; flex-direction: column; gap: 16px;
      }
      .og-wizard-title {
        font-size: 24px; font-weight: 700;
        color: var(--text-primary);
        text-align: center;
      }
      .og-wizard-choice {
        padding: 20px 16px;
        border: 2px solid var(--divider-color);
        border-radius: 12px; background: var(--item-bg);
        text-align: left; cursor: pointer;
        touch-action: manipulation;
        display: flex; flex-direction: column; gap: 4px;
        color: var(--text-primary);
      }
      .og-wizard-choice:active { border-color: var(--accent-color); }
      .og-wizard-choice strong { font-size: 18px; }
      .og-wizard-choice span { font-size: 14px; color: var(--crossed-off-text); }
      .og-wizard-list-option {
        padding: 16px 20px;
        border: 1px solid var(--divider-color);
        border-radius: 8px; background: var(--item-bg);
        color: var(--text-primary); font-size: 18px;
        cursor: pointer; touch-action: manipulation;
        text-align: left;
      }
      .og-wizard-list-option:active { border-color: var(--accent-color); }
    `;
  }
}

/* ------------------------------------------------------------------ */
/*  Registration                                                      */
/* ------------------------------------------------------------------ */

customElements.define('ourgroceries-kiosk-card', OurGroceriesKioskCard);
customElements.define('ourgroceries-kiosk-card-editor', OurGroceriesKioskCardEditor);

window.customCards = window.customCards || [];
window.customCards.push({
  type: 'ourgroceries-kiosk-card',
  name: 'OurGroceries Kiosk Card',
  description: 'Kitchen tablet kiosk card for managing OurGroceries lists.',
  preview: true,
});

console.info(
  `%c OurGroceries Kiosk %c v${OG_CARD_VERSION} `,
  'background: #6B8E23; color: #fff; font-weight: bold; padding: 2px 6px; border-radius: 4px 0 0 4px;',
  'background: #C5A500; color: #fff; padding: 2px 6px; border-radius: 0 4px 4px 0;'
);
