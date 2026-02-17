/**
 * OurGroceries Kiosk Card v3.0.0
 * Custom Home Assistant Lovelace card for kitchen tablet kiosks.
 * Visual style modeled after the OurGroceries Android app.
 * Fetches master category cache from /local/og-master-categories.json
 * and all-categories list from /local/og-all-categories.json.
 * Vanilla HTMLElement — no build step, no external dependencies.
 */

const OG_CARD_VERSION = '3.0.0';

/* ------------------------------------------------------------------ */
/*  Editor                                                            */
/* ------------------------------------------------------------------ */

class OurGroceriesKioskCardEditor extends HTMLElement {
  constructor() {
    super();
    this._config = {};
    this._hass = null;
  }

  set hass(hass) {
    this._hass = hass;
  }

  setConfig(config) {
    this._config = { ...config };
    this._render();
  }

  _render() {
    if (this.shadowRoot) {
      this.shadowRoot.innerHTML = '';
    } else {
      this.attachShadow({ mode: 'open' });
    }

    const root = this.shadowRoot;
    root.innerHTML = `
      <style>
        .editor { padding: 16px; font-family: var(--paper-font-body1_-_font-family, sans-serif); }
        .row { margin-bottom: 12px; }
        label { display: block; font-weight: 500; margin-bottom: 4px; font-size: 14px; }
        input, select, textarea {
          width: 100%; box-sizing: border-box; padding: 8px;
          border: 1px solid var(--divider-color, #ccc); border-radius: 4px;
          font-size: 14px; background: var(--card-background-color, #fff);
          color: var(--primary-text-color, #000);
        }
        .checkbox-row { display: flex; align-items: center; gap: 8px; }
        .checkbox-row input { width: auto; }
      </style>
      <div class="editor">
        <div class="row">
          <label>Entity (todo entity)</label>
          <input id="entity" value="${this._config.entity || ''}" placeholder="todo.my_list" />
        </div>
        <div class="row">
          <label>Title</label>
          <input id="title" value="${this._config.title || ''}" placeholder="Grocery List" />
        </div>
        <div class="row checkbox-row">
          <input id="show_completed" type="checkbox" ${this._config.show_completed ? 'checked' : ''} />
          <label for="show_completed" style="margin:0">Show completed items</label>
        </div>
      </div>
    `;

    const fire = () => {
      const ev = new CustomEvent('config-changed', {
        detail: { config: { ...this._config } },
        bubbles: true,
        composed: true,
      });
      this.dispatchEvent(ev);
    };

    root.getElementById('entity').addEventListener('input', (e) => {
      this._config.entity = e.target.value.trim();
      fire();
    });
    root.getElementById('title').addEventListener('input', (e) => {
      this._config.title = e.target.value;
      fire();
    });
    root.getElementById('show_completed').addEventListener('change', (e) => {
      this._config.show_completed = e.target.checked;
      fire();
    });
  }
}

/* ------------------------------------------------------------------ */
/*  Main Card                                                         */
/* ------------------------------------------------------------------ */

class OurGroceriesKioskCard extends HTMLElement {
  static get properties() {
    return { hass: {}, _config: {} };
  }

  static getConfigElement() {
    return document.createElement('ourgroceries-kiosk-card-editor');
  }

  static getStubConfig() {
    return {
      entity: 'todo.grocery_list',
      title: 'Grocery List',
      show_completed: false,
    };
  }

  constructor() {
    super();
    this._config = {};
    this._hass = null;
    this._items = [];
    this._masterCategories = {};  // item name (lowercase) -> category name
    this._allCategories = [];     // all category names from OG
    this._categoryFetchId = null;
    this._previousItemUids = new Set();
    this._unsubscribe = null;
    this._subscribeRetryId = null;
    this._autocompleteIdx = -1;
    this._statusTimeoutId = null;
    this._domBuilt = false;
    this._inputVisible = false;
    this._HISTORY_KEY = 'og-kiosk-history';
    this._UID_MAP_KEY = 'og-kiosk-uid-map';
    this._MAX_HISTORY = 500;
    this._isFirstUpdate = true;

    // Edit view state
    this._editingItem = null;       // the item object being edited
    this._editItemCategory = null;  // current category while editing
    this._editNameDirty = false;    // whether name was changed
  }

  /* ---- Lifecycle ---- */

  connectedCallback() {
    if (this._domBuilt) {
      this._subscribeToItems();
      this._fetchMasterCategories();
      this._fetchAllCategories();
      this._startCategoryPolling();
    }
  }

  disconnectedCallback() {
    this._cleanupSubscription();
    this._stopCategoryPolling();
    if (this._statusTimeoutId) clearTimeout(this._statusTimeoutId);
    if (this._subscribeRetryId) clearTimeout(this._subscribeRetryId);
  }

  /* ---- Config ---- */

  setConfig(config) {
    if (!config.entity) {
      throw new Error('Please define an entity (todo entity)');
    }
    this._config = {
      entity: config.entity,
      title: config.title || 'Grocery List',
      show_completed: !!config.show_completed,
    };
    this._HISTORY_KEY = `og-kiosk-history-${this._config.entity}`;
    this._UID_MAP_KEY = `og-kiosk-uid-map-${this._config.entity}`;
    this._buildDom();
  }

  getCardSize() {
    return 8;
  }

  /* ---- Hass setter ---- */

  set hass(hass) {
    const firstSet = !this._hass;
    this._hass = hass;
    if (firstSet) {
      this._subscribeToItems();
      this._fetchMasterCategories();
      this._fetchAllCategories();
      this._startCategoryPolling();
    }
  }

  get hass() {
    return this._hass;
  }

  /* ---- DOM construction ---- */

  _buildDom() {
    if (this.shadowRoot) {
      this.shadowRoot.innerHTML = '';
    } else {
      this.attachShadow({ mode: 'open' });
    }

    const root = this.shadowRoot;
    root.innerHTML = `
      <style>${this._buildStyles()}</style>
      <ha-card>
        <!-- Main list view -->
        <div id="og-main-view">
          <div class="og-header">
            <span class="og-header-title">${this._escHtml(this._config.title)}</span>
            <button id="og-header-add-btn" class="og-header-add-btn" aria-label="Add item">
              <svg viewBox="0 0 24 24" width="30" height="30"><path fill="currentColor" d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/></svg>
            </button>
          </div>

          <div id="og-input-area" class="og-input-area hidden">
            <div class="og-input-row">
              <div class="og-input-wrapper">
                <input id="og-input" type="text" placeholder="Add an item…"
                       autocomplete="off" autocorrect="on" autocapitalize="sentences" />
                <div id="og-autocomplete" class="autocomplete-dropdown"></div>
              </div>
              <button id="og-close-input-btn" class="og-close-input-btn" aria-label="Close">
                <svg viewBox="0 0 24 24" width="24" height="24"><path fill="currentColor" d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>
              </button>
            </div>
            <div id="og-status" class="og-status hidden"></div>
          </div>

          <div id="og-list-container" class="og-list-container">
            <div id="og-list" class="og-list"></div>
          </div>
        </div>

        <!-- Edit item view (overlay) -->
        <div id="og-edit-overlay" class="og-edit-overlay hidden">
          <div class="og-edit-header">
            <button id="og-edit-back-btn" class="og-edit-back-btn" aria-label="Back">
              <svg viewBox="0 0 24 24" width="20" height="20"><path fill="currentColor" d="M15.41 7.41L14 6l-6 6 6 6 1.41-1.41L10.83 12z"/></svg>
              <span>${this._escHtml(this._config.title)}</span>
            </button>
            <span class="og-edit-header-center">Item Details</span>
            <button id="og-edit-delete-btn" class="og-edit-delete-btn" aria-label="Delete">
              <svg viewBox="0 0 24 24" width="22" height="22"><path fill="currentColor" d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>
            </button>
          </div>
          <div class="og-edit-body">
            <input id="og-edit-name" class="og-edit-name" type="text"
                   autocomplete="off" autocorrect="on" autocapitalize="sentences" />
            <div class="og-edit-qty-row">
              <button id="og-less-btn" class="og-qty-btn og-qty-less">Fewer</button>
              <div class="og-qty-divider"></div>
              <button id="og-more-btn" class="og-qty-btn og-qty-more">More</button>
            </div>
            <button id="og-edit-category-btn" class="og-edit-category-btn">
              <svg class="og-cat-icon" viewBox="0 0 24 24" width="20" height="20"><path fill="currentColor" d="M12 2l-5.5 9h11L12 2zm0 3.84L13.93 9h-3.87L12 5.84zM17.5 13c-2.49 0-4.5 2.01-4.5 4.5s2.01 4.5 4.5 4.5 4.5-2.01 4.5-4.5-2.01-4.5-4.5-4.5zm0 7c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5zM3 21.5h8v-8H3v8zm2-6h4v4H5v-4z"/></svg>
              <span>Category: </span>
              <span id="og-edit-category-name" class="og-edit-category-value">Uncategorized</span>
              <svg class="og-cat-chevron" viewBox="0 0 24 24" width="20" height="20"><path fill="currentColor" d="M10 6L8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z"/></svg>
            </button>
          </div>
        </div>

        <!-- Category picker (overlay) -->
        <div id="og-category-overlay" class="og-category-overlay hidden">
          <div class="og-category-picker-header">
            <button id="og-category-back-btn" class="og-category-back-btn" aria-label="Back">
              <svg viewBox="0 0 24 24" width="20" height="20"><path fill="currentColor" d="M15.41 7.41L14 6l-6 6 6 6 1.41-1.41L10.83 12z"/></svg>
              <span>Back</span>
            </button>
            <span class="og-category-header-title">Categories</span>
            <span class="og-category-header-spacer"></span>
          </div>
          <div id="og-category-list" class="og-category-list"></div>
        </div>

        <!-- Confirm dialog (shared) -->
        <div id="og-confirm-overlay" class="confirm-overlay hidden">
          <div class="confirm-dialog">
            <p id="og-confirm-text"></p>
            <div class="confirm-buttons">
              <button id="og-confirm-cancel" class="confirm-btn cancel-btn">Cancel</button>
              <button id="og-confirm-remove" class="confirm-btn remove-btn">Remove</button>
            </div>
          </div>
        </div>
      </ha-card>
    `;

    this._domBuilt = true;
    this._bindEvents();
  }

  _bindEvents() {
    const root = this.shadowRoot;

    // --- Main list view events ---
    root.getElementById('og-header-add-btn').addEventListener('click', () => this._showInput());
    root.getElementById('og-close-input-btn').addEventListener('click', () => this._hideInput());

    const input = root.getElementById('og-input');
    const autocomplete = root.getElementById('og-autocomplete');

    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        if (this._autocompleteIdx >= 0) {
          const items = autocomplete.querySelectorAll('.ac-item');
          if (items[this._autocompleteIdx]) {
            items[this._autocompleteIdx].click();
            return;
          }
        }
        this._handleAdd();
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        this._moveAutocomplete(1);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        this._moveAutocomplete(-1);
      } else if (e.key === 'Escape') {
        this._hideAutocomplete();
        this._hideInput();
      }
    });

    input.addEventListener('input', () => this._updateAutocomplete());
    input.addEventListener('focus', () => this._updateAutocomplete());

    root.addEventListener('click', (e) => {
      if (!e.composedPath().includes(input) && !e.composedPath().includes(autocomplete)) {
        this._hideAutocomplete();
      }
    });

    // --- Confirm dialog events ---
    const overlay = root.getElementById('og-confirm-overlay');
    root.getElementById('og-confirm-cancel').addEventListener('click', () => this._hideConfirm());
    root.getElementById('og-confirm-remove').addEventListener('click', () => {
      if (this._pendingRemoveUid) {
        this._removeItem(this._pendingRemoveUid);
      }
      this._hideConfirm();
      // If we came from edit view, close it too
      if (this._editingItem) {
        this._hideEditView();
      }
    });
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) this._hideConfirm();
    });

    // --- Edit view events ---
    root.getElementById('og-edit-back-btn').addEventListener('click', () => this._handleEditBack());
    root.getElementById('og-edit-delete-btn').addEventListener('click', () => {
      if (this._editingItem) {
        this._showConfirm(this._editingItem.uid, this._editingItem.summary);
      }
    });

    const editNameInput = root.getElementById('og-edit-name');
    editNameInput.addEventListener('input', () => {
      this._editNameDirty = true;
    });
    editNameInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        editNameInput.blur();
      }
    });
    editNameInput.addEventListener('blur', () => {
      if (this._editNameDirty && this._editingItem) {
        this._handleEditNameSave();
      }
    });

    root.getElementById('og-less-btn').addEventListener('click', () => this._handleLess());
    root.getElementById('og-more-btn').addEventListener('click', () => this._handleMore());
    root.getElementById('og-edit-category-btn').addEventListener('click', () => this._showCategoryPicker());

    // --- Category picker events ---
    root.getElementById('og-category-back-btn').addEventListener('click', () => this._hideCategoryPicker());
  }

  /* ---- Show / Hide input ---- */

  _showInput() {
    const area = this.shadowRoot.getElementById('og-input-area');
    const input = this.shadowRoot.getElementById('og-input');
    area.classList.remove('hidden');
    this._inputVisible = true;
    setTimeout(() => input.focus(), 50);
  }

  _hideInput() {
    const area = this.shadowRoot.getElementById('og-input-area');
    const input = this.shadowRoot.getElementById('og-input');
    area.classList.add('hidden');
    input.value = '';
    this._hideAutocomplete();
    this._inputVisible = false;
  }

  /* ---- Master category cache ---- */

  async _fetchMasterCategories() {
    try {
      const resp = await fetch(`/local/og-master-categories.json?_=${Date.now()}`);
      if (resp.ok) {
        this._masterCategories = await resp.json();
        this._renderList();
      }
    } catch (e) {
      console.warn('OG Kiosk: failed to fetch master categories', e);
    }
  }

  async _fetchAllCategories() {
    try {
      const resp = await fetch(`/local/og-all-categories.json?_=${Date.now()}`);
      if (resp.ok) {
        this._allCategories = await resp.json();
      }
    } catch (e) {
      console.warn('OG Kiosk: failed to fetch all categories', e);
    }
  }

  _startCategoryPolling() {
    this._stopCategoryPolling();
    this._categoryFetchId = setInterval(() => {
      this._fetchMasterCategories();
      this._fetchAllCategories();
    }, 300000);
  }

  _stopCategoryPolling() {
    if (this._categoryFetchId) {
      clearInterval(this._categoryFetchId);
      this._categoryFetchId = null;
    }
  }

  /* ---- Edit View ---- */

  _showEditView(uid) {
    const item = this._items.find((i) => i.uid === uid);
    if (!item) return;

    this._editingItem = item;
    this._editNameDirty = false;
    this._editItemCategory = this._masterCategories[item.summary.trim().toLowerCase()] || 'Uncategorized';

    const root = this.shadowRoot;
    root.getElementById('og-edit-name').value = item.summary;
    root.getElementById('og-edit-category-name').textContent = this._editItemCategory;

    root.getElementById('og-edit-overlay').classList.remove('hidden');
  }

  _hideEditView() {
    this._editingItem = null;
    this._editNameDirty = false;
    const root = this.shadowRoot;
    root.getElementById('og-edit-overlay').classList.add('hidden');
    root.getElementById('og-category-overlay').classList.add('hidden');
    this._renderList();
  }

  _handleEditBack() {
    // Save any pending name change before going back
    if (this._editNameDirty && this._editingItem) {
      this._handleEditNameSave();
    }
    this._hideEditView();
  }

  async _handleEditNameSave() {
    if (!this._editingItem || !this._hass) return;
    const input = this.shadowRoot.getElementById('og-edit-name');
    const newName = input.value.trim();
    if (!newName || newName === this._editingItem.summary) {
      this._editNameDirty = false;
      return;
    }

    try {
      await this._hass.callService('todo', 'update_item', {
        item: this._editingItem.uid,
        rename: newName,
      }, { entity_id: this._config.entity });
      // Update local reference
      this._editingItem.summary = newName;
      this._editNameDirty = false;
    } catch (err) {
      console.error('OG Kiosk: rename failed', err);
    }
  }

  /* ---- Quantity More / Less ---- */

  _parseQuantity(name) {
    const match = name.match(/^(.*?)\s+\((\d+)\)$/);
    if (match) {
      return { baseName: match[1], quantity: parseInt(match[2], 10) };
    }
    return { baseName: name, quantity: 1 };
  }

  _formatWithQuantity(baseName, qty) {
    if (qty <= 1) return baseName;
    return `${baseName} (${qty})`;
  }

  async _handleMore() {
    if (!this._editingItem || !this._hass) return;
    const input = this.shadowRoot.getElementById('og-edit-name');
    const currentName = input.value.trim();
    const { baseName, quantity } = this._parseQuantity(currentName);
    const newName = this._formatWithQuantity(baseName, quantity + 1);

    input.value = newName;
    this._editNameDirty = false; // we're saving immediately

    try {
      await this._hass.callService('todo', 'update_item', {
        item: this._editingItem.uid,
        rename: newName,
      }, { entity_id: this._config.entity });
      this._editingItem.summary = newName;
    } catch (err) {
      console.error('OG Kiosk: quantity change failed', err);
      input.value = currentName; // revert
    }
  }

  async _handleLess() {
    if (!this._editingItem || !this._hass) return;
    const input = this.shadowRoot.getElementById('og-edit-name');
    const currentName = input.value.trim();
    const { baseName, quantity } = this._parseQuantity(currentName);

    if (quantity <= 1) return; // can't go below 1

    const newName = this._formatWithQuantity(baseName, quantity - 1);
    input.value = newName;
    this._editNameDirty = false;

    try {
      await this._hass.callService('todo', 'update_item', {
        item: this._editingItem.uid,
        rename: newName,
      }, { entity_id: this._config.entity });
      this._editingItem.summary = newName;
    } catch (err) {
      console.error('OG Kiosk: quantity change failed', err);
      input.value = currentName;
    }
  }

  /* ---- Category Picker ---- */

  _showCategoryPicker() {
    this._renderCategoryPicker();
    this.shadowRoot.getElementById('og-category-overlay').classList.remove('hidden');
  }

  _hideCategoryPicker() {
    this.shadowRoot.getElementById('og-category-overlay').classList.add('hidden');
  }

  _renderCategoryPicker() {
    const listEl = this.shadowRoot.getElementById('og-category-list');
    if (!listEl) return;

    // Build category list: use _allCategories if available, otherwise extract from master
    let categories = [];
    if (this._allCategories.length > 0) {
      categories = [...this._allCategories];
    } else {
      const catSet = new Set(Object.values(this._masterCategories));
      categories = [...catSet];
    }
    categories.sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));

    // Always include Uncategorized at the end
    if (!categories.includes('Uncategorized')) {
      categories.push('Uncategorized');
    }

    const currentCat = this._editItemCategory || 'Uncategorized';

    let html = '';
    for (const cat of categories) {
      const selected = cat === currentCat;
      html += `
        <button class="og-category-item${selected ? ' selected' : ''}" data-category="${this._escAttr(cat)}">
          <span class="og-category-item-name">${this._escHtml(cat)}</span>
          ${selected ? '<svg class="og-category-check" viewBox="0 0 24 24" width="22" height="22"><path fill="currentColor" d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>' : ''}
        </button>
      `;
    }

    listEl.innerHTML = html;

    listEl.querySelectorAll('.og-category-item').forEach((btn) => {
      btn.addEventListener('click', () => {
        const categoryName = btn.getAttribute('data-category');
        this._handleCategorySelect(categoryName);
      });
    });
  }

  async _handleCategorySelect(categoryName) {
    if (!this._editingItem) return;

    const oldCategory = this._editItemCategory;
    this._editItemCategory = categoryName;

    // Update the edit view display
    const catNameEl = this.shadowRoot.getElementById('og-edit-category-name');
    if (catNameEl) catNameEl.textContent = categoryName;

    // Update local master categories cache immediately
    const itemKey = this._editingItem.summary.trim().toLowerCase();
    if (categoryName === 'Uncategorized') {
      delete this._masterCategories[itemKey];
    } else {
      this._masterCategories[itemKey] = categoryName;
    }

    // Go back to edit view
    this._hideCategoryPicker();

    // Push change to OurGroceries server via HA
    try {
      await this._saveCategoryToServer(this._editingItem.summary, categoryName);
    } catch (err) {
      console.error('OG Kiosk: category change failed', err);
      // Revert local cache on failure
      if (oldCategory === 'Uncategorized') {
        delete this._masterCategories[itemKey];
      } else {
        this._masterCategories[itemKey] = oldCategory;
      }
      this._editItemCategory = oldCategory;
      if (catNameEl) catNameEl.textContent = oldCategory;
    }
  }

  async _saveCategoryToServer(itemName, categoryName) {
    if (!this._hass) throw new Error('No hass connection');

    // Get the OG list name from the entity's friendly_name
    const entityState = this._hass.states[this._config.entity];
    const listName = entityState ? entityState.attributes.friendly_name || '' : '';

    const payload = JSON.stringify({
      item_name: itemName,
      category_name: categoryName === 'Uncategorized' ? '' : categoryName,
      list_name: listName,
    });

    // Base64-encode to avoid shell quoting issues (quotes, apostrophes, etc.)
    const bytes = new TextEncoder().encode(payload);
    let binary = '';
    for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
    const b64 = btoa(binary);

    console.info('OG Kiosk: setting category', payload);

    // Set the input_text with the base64-encoded data
    await this._hass.callService('input_text', 'set_value', {
      value: b64,
    }, { entity_id: 'input_text.og_category_change' });

    // Brief delay to ensure state is committed
    await new Promise((r) => setTimeout(r, 500));

    // Trigger the shell command to push to OG
    console.info('OG Kiosk: calling shell_command.og_set_category');
    await this._hass.callService('shell_command', 'og_set_category', {});
    console.info('OG Kiosk: category change submitted');
  }

  /* ---- Styles ---- */

  _buildStyles() {
    return `
      :host {
        --og-green: #81a51d;
        --og-green-dark: #6B8E23;
        --og-gold: #d3bb19;
        --og-gold-dark: #C5A500;
        --og-cream: #FFFDF5;
        --og-white: #FFFFFF;
        --og-text: #333333;
        --og-text-light: #666666;
        --og-divider: #E8E4D9;
        --og-orange: #E68A00;
        --og-error: #D44;
        --og-success: #4caf50;

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
        background: var(--og-cream);
        color: var(--og-text);
        box-shadow: 0 2px 8px rgba(0,0,0,0.12);
      }

      .hidden { display: none !important; }

      /* ---- Header (green bar) ---- */
      .og-header {
        background: var(--og-green);
        padding: 16px 20px;
        display: flex;
        align-items: center;
        justify-content: space-between;
      }
      .og-header-title {
        font-size: 28px;
        font-weight: 700;
        color: var(--og-white);
        letter-spacing: -0.3px;
      }
      .og-header-add-btn {
        width: 48px;
        height: 48px;
        min-width: 48px;
        border: none;
        border-radius: 50%;
        background: rgba(255,255,255,0.2);
        color: var(--og-white);
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: background 0.2s;
        touch-action: manipulation;
      }
      .og-header-add-btn:active {
        background: rgba(255,255,255,0.35);
      }

      /* ---- Input area ---- */
      .og-input-area {
        background: var(--og-white);
        padding: 12px 16px;
        border-bottom: 1px solid var(--og-divider);
      }
      .og-input-row {
        display: flex;
        gap: 8px;
        align-items: center;
      }
      .og-input-wrapper {
        flex: 1;
        position: relative;
      }
      #og-input {
        width: 100%;
        box-sizing: border-box;
        height: 48px;
        padding: 0 14px;
        border: 2px solid var(--og-divider);
        border-radius: 8px;
        background: var(--og-cream);
        color: var(--og-text);
        font-size: 18px;
        outline: none;
        transition: border-color 0.2s;
        touch-action: manipulation;
      }
      #og-input::placeholder {
        color: var(--og-text-light);
        opacity: 0.6;
      }
      #og-input:focus {
        border-color: var(--og-green);
      }
      .og-close-input-btn {
        width: 48px;
        height: 48px;
        min-width: 48px;
        border: none;
        border-radius: 8px;
        background: transparent;
        color: var(--og-text-light);
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        touch-action: manipulation;
      }
      .og-close-input-btn:active { background: rgba(0,0,0,0.05); }

      /* ---- Autocomplete ---- */
      .autocomplete-dropdown {
        position: absolute;
        top: 100%;
        left: 0;
        right: 0;
        z-index: 10;
        background: var(--og-white);
        border: 1px solid var(--og-divider);
        border-radius: 0 0 8px 8px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.12);
        max-height: 280px;
        overflow-y: auto;
        display: none;
      }
      .autocomplete-dropdown.open { display: block; }
      .ac-item {
        padding: 12px 14px;
        font-size: 17px;
        cursor: pointer;
        border-bottom: 1px solid var(--og-divider);
        touch-action: manipulation;
        color: var(--og-text);
        transition: background 0.15s;
      }
      .ac-item:last-child { border-bottom: none; }
      .ac-item:active, .ac-item.highlighted { background: #F0EDE4; }
      .ac-item .ac-match { font-weight: 700; }
      .ac-item .ac-on-list {
        font-size: 12px;
        color: var(--og-text-light);
        margin-left: 8px;
      }

      /* ---- Status ---- */
      .og-status {
        padding: 6px 0;
        font-size: 14px;
        margin-top: 8px;
        text-align: center;
      }
      .og-status.success { color: var(--og-success); }
      .og-status.error { color: var(--og-error); }

      /* ---- List ---- */
      .og-list-container {
        max-height: 70vh;
        overflow-y: auto;
        -webkit-overflow-scrolling: touch;
      }
      .og-list {
        display: flex;
        flex-direction: column;
      }

      .og-category-header {
        background: #d3bb19;
        padding: 4px 16px;
        font-size: 17px;
        font-weight: 700;
        color: var(--og-white);
        letter-spacing: 0.2px;
      }

      .og-item {
        display: flex;
        align-items: center;
        padding: 14px 16px;
        background: var(--og-white);
        border-bottom: 1px solid var(--og-divider);
        min-height: 48px;
        animation: ogFadeIn 0.2s ease;
      }
      .og-item.flash { animation: ogFlash 1.2s ease; }
      @keyframes ogFlash {
        0% { background: #E8F5C9; }
        100% { background: var(--og-white); }
      }
      @keyframes ogFadeIn {
        from { opacity: 0; transform: translateY(-4px); }
        to { opacity: 1; transform: translateY(0); }
      }

      .og-item-name {
        flex: 1;
        font-size: 22px;
        line-height: 1.3;
        word-break: break-word;
        color: var(--og-text);
      }
      .og-item.completed .og-item-name {
        text-decoration: line-through;
        opacity: 0.45;
      }
      .og-item-actions {
        display: flex;
        align-items: center;
        margin-left: 8px;
      }
      .og-item-menu-btn {
        width: 48px;
        height: 48px;
        min-width: 48px;
        border: none;
        border-radius: 50%;
        background: transparent;
        color: var(--og-orange);
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: background 0.2s;
        touch-action: manipulation;
      }
      .og-item-menu-btn:active { background: rgba(230,138,0,0.1); }
      .og-item-menu-btn svg { width: 22px; height: 22px; }

      .og-completed-header {
        background: var(--og-divider);
        padding: 8px 16px;
        font-size: 13px;
        font-weight: 600;
        text-transform: uppercase;
        letter-spacing: 0.5px;
        color: var(--og-text-light);
      }

      .og-empty {
        padding: 40px 16px;
        text-align: center;
        color: var(--og-text-light);
        font-size: 17px;
      }

      /* ---- Confirm overlay ---- */
      .confirm-overlay {
        position: absolute;
        inset: 0;
        z-index: 200;
        background: rgba(0,0,0,0.45);
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 24px;
      }
      .confirm-dialog {
        background: var(--og-white);
        border-radius: 12px;
        padding: 24px;
        max-width: 340px;
        width: 100%;
        box-shadow: 0 8px 32px rgba(0,0,0,0.25);
      }
      .confirm-dialog p {
        font-size: 18px;
        margin: 0 0 20px;
        line-height: 1.4;
        color: var(--og-text);
      }
      .confirm-buttons { display: flex; gap: 12px; }
      .confirm-btn {
        flex: 1;
        height: 50px;
        border: none;
        border-radius: 8px;
        font-size: 17px;
        font-weight: 600;
        cursor: pointer;
        touch-action: manipulation;
        transition: opacity 0.2s;
      }
      .confirm-btn:active { opacity: 0.7; }
      .cancel-btn { background: #F0EDE4; color: var(--og-text); }
      .remove-btn { background: var(--og-error); color: var(--og-white); }

      /* ---- Edit Item Overlay ---- */
      .og-edit-overlay {
        position: absolute;
        inset: 0;
        z-index: 100;
        background: var(--og-cream);
        display: flex;
        flex-direction: column;
      }
      .og-edit-header {
        background: var(--og-cream);
        padding: 14px 16px;
        display: flex;
        align-items: center;
        border-bottom: 1px solid var(--og-divider);
        min-height: 52px;
      }
      .og-edit-back-btn {
        border: none;
        background: transparent;
        color: var(--og-orange);
        cursor: pointer;
        display: flex;
        align-items: center;
        gap: 2px;
        font-size: 17px;
        font-weight: 500;
        padding: 8px 4px;
        touch-action: manipulation;
        white-space: nowrap;
      }
      .og-edit-back-btn:active { opacity: 0.6; }
      .og-edit-header-center {
        flex: 1;
        text-align: center;
        font-size: 18px;
        font-weight: 700;
        color: var(--og-text);
      }
      .og-edit-delete-btn {
        width: 44px;
        height: 44px;
        min-width: 44px;
        border: none;
        border-radius: 8px;
        background: transparent;
        color: var(--og-orange);
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        touch-action: manipulation;
      }
      .og-edit-delete-btn:active { background: rgba(230,138,0,0.1); }

      .og-edit-body {
        padding: 20px 16px;
        display: flex;
        flex-direction: column;
        gap: 16px;
        overflow-y: auto;
        flex: 1;
      }
      .og-edit-name {
        width: 100%;
        box-sizing: border-box;
        height: 52px;
        padding: 0 14px;
        border: 1px solid var(--og-divider);
        border-radius: 8px;
        background: var(--og-white);
        color: var(--og-text);
        font-size: 18px;
        outline: none;
        transition: border-color 0.2s;
      }
      .og-edit-name:focus {
        border-color: var(--og-orange);
      }

      /* Quantity Less/More */
      .og-edit-qty-row {
        display: flex;
        align-items: center;
        align-self: flex-start;
        border: 2px solid var(--og-orange);
        border-radius: 8px;
        overflow: hidden;
      }
      .og-qty-btn {
        border: none;
        background: transparent;
        color: var(--og-orange);
        font-size: 17px;
        font-weight: 600;
        padding: 10px 24px;
        cursor: pointer;
        touch-action: manipulation;
        transition: background 0.15s;
      }
      .og-qty-btn:active { background: rgba(230,138,0,0.1); }
      .og-qty-divider {
        width: 2px;
        height: 24px;
        background: var(--og-orange);
      }

      /* Category button */
      .og-edit-category-btn {
        display: flex;
        align-items: center;
        gap: 8px;
        width: 100%;
        box-sizing: border-box;
        padding: 14px 14px;
        border: 1px solid var(--og-divider);
        border-radius: 8px;
        background: var(--og-white);
        color: var(--og-orange);
        font-size: 17px;
        cursor: pointer;
        touch-action: manipulation;
        transition: background 0.15s;
        text-align: left;
      }
      .og-edit-category-btn:active { background: #FFF8EE; }
      .og-cat-icon { flex-shrink: 0; }
      .og-edit-category-value {
        font-weight: 600;
      }
      .og-cat-chevron {
        margin-left: auto;
        flex-shrink: 0;
        opacity: 0.5;
      }

      /* ---- Category Picker Overlay ---- */
      .og-category-overlay {
        position: absolute;
        inset: 0;
        z-index: 150;
        background: var(--og-cream);
        display: flex;
        flex-direction: column;
      }
      .og-category-picker-header {
        background: var(--og-green);
        padding: 14px 16px;
        display: flex;
        align-items: center;
        min-height: 52px;
      }
      .og-category-back-btn {
        border: none;
        background: transparent;
        color: var(--og-white);
        cursor: pointer;
        display: flex;
        align-items: center;
        gap: 2px;
        font-size: 17px;
        font-weight: 500;
        padding: 8px 4px;
        touch-action: manipulation;
      }
      .og-category-back-btn:active { opacity: 0.7; }
      .og-category-header-title {
        flex: 1;
        text-align: center;
        font-size: 20px;
        font-weight: 700;
        color: var(--og-white);
      }
      .og-category-header-spacer {
        width: 60px; /* balance the back button */
      }
      .og-category-list {
        flex: 1;
        overflow-y: auto;
        -webkit-overflow-scrolling: touch;
      }
      .og-category-item {
        display: flex;
        align-items: center;
        width: 100%;
        box-sizing: border-box;
        padding: 16px 20px;
        border: none;
        border-bottom: 1px solid var(--og-divider);
        background: var(--og-white);
        text-align: left;
        font-size: 18px;
        color: var(--og-text);
        cursor: pointer;
        touch-action: manipulation;
        transition: background 0.15s;
      }
      .og-category-item:active { background: #F0EDE4; }
      .og-category-item.selected {
        color: var(--og-text);
      }
      .og-category-item-name { flex: 1; }
      .og-category-check {
        color: var(--og-orange);
        flex-shrink: 0;
      }
    `;
  }

  /* ---- Subscription ---- */

  _cleanupSubscription() {
    if (this._unsubscribe) {
      if (typeof this._unsubscribe === 'function') {
        this._unsubscribe();
      } else if (this._unsubscribe.then) {
        this._unsubscribe.then((unsub) => { if (typeof unsub === 'function') unsub(); });
      }
      this._unsubscribe = null;
    }
  }

  _subscribeToItems() {
    if (!this._hass || !this._hass.connection || !this._config.entity) return;
    this._cleanupSubscription();

    try {
      const prom = this._hass.connection.subscribeMessage(
        (msg) => this._handleItemsUpdate(msg),
        { type: 'todo/item/subscribe', entity_id: this._config.entity }
      );
      this._unsubscribe = prom;
      prom.catch((err) => {
        console.warn('OG Kiosk: subscription failed, retrying in 5s', err);
        this._subscribeRetryId = setTimeout(() => this._subscribeToItems(), 5000);
      });
    } catch (err) {
      console.warn('OG Kiosk: subscription error', err);
      this._subscribeRetryId = setTimeout(() => this._subscribeToItems(), 5000);
    }
  }

  _handleItemsUpdate(msg) {
    if (!msg || !msg.items) return;

    const allItems = msg.items;
    const newUids = new Set(allItems.filter((i) => i.status === 'needs_action').map((i) => i.uid));

    const flashUids = new Set();
    if (!this._isFirstUpdate) {
      for (const uid of newUids) {
        if (!this._previousItemUids.has(uid)) flashUids.add(uid);
      }
    }
    this._isFirstUpdate = false;
    this._previousItemUids = newUids;

    // Track uid->name to detect renames and clean stale history entries
    const oldUidMap = this._getUidMap();
    const newUidMap = {};
    for (const item of allItems) {
      newUidMap[item.uid] = item.summary;
      const oldName = oldUidMap[item.uid];
      if (oldName && oldName !== item.summary) {
        // Item was renamed — remove old name (and quantity variants) from history
        this._removeFromHistory(oldName);
      }
      this._addToHistory(item.summary);
    }
    this._saveUidMap(newUidMap);

    this._items = allItems;
    this._flashUids = flashUids;
    this._renderList();

    // If editing an item, update the reference in case it was modified externally
    if (this._editingItem) {
      const updated = allItems.find((i) => i.uid === this._editingItem.uid);
      if (updated) {
        this._editingItem = updated;
      }
    }
  }

  /* ---- Render list ---- */

  _renderList() {
    const listEl = this.shadowRoot && this.shadowRoot.getElementById('og-list');
    if (!listEl) return;

    const needsAction = this._items.filter((i) => i.status === 'needs_action');
    const completed = this._config.show_completed
      ? this._items.filter((i) => i.status === 'completed')
      : [];

    if (needsAction.length === 0 && completed.length === 0) {
      listEl.innerHTML = '<div class="og-empty">List is empty</div>';
      return;
    }

    let html = '';

    const grouped = this._groupByCategory(needsAction);
    const categoryNames = Object.keys(grouped).sort((a, b) =>
      a === 'Uncategorized' ? 1 : b === 'Uncategorized' ? -1 :
      a.toLowerCase().localeCompare(b.toLowerCase())
    );

    for (const cat of categoryNames) {
      const items = grouped[cat].sort((a, b) =>
        a.summary.toLowerCase().localeCompare(b.summary.toLowerCase())
      );

      if (categoryNames.length > 1 || cat !== 'Uncategorized') {
        html += `<div class="og-category-header">${this._escHtml(cat)}</div>`;
      }

      for (const item of items) {
        const flash = this._flashUids && this._flashUids.has(item.uid) ? ' flash' : '';
        html += `
          <div class="og-item${flash}" data-uid="${this._escAttr(item.uid)}">
            <span class="og-item-name">${this._escHtml(item.summary)}</span>
            <div class="og-item-actions">
              <button class="og-item-menu-btn" data-uid="${this._escAttr(item.uid)}" aria-label="Edit ${this._escAttr(item.summary)}">
                <svg viewBox="0 0 24 24"><circle cx="5" cy="12" r="2" fill="currentColor"/><circle cx="12" cy="12" r="2" fill="currentColor"/><circle cx="19" cy="12" r="2" fill="currentColor"/></svg>
              </button>
            </div>
          </div>
        `;
      }
    }

    if (completed.length > 0) {
      html += '<div class="og-completed-header">Completed</div>';
      const sortedCompleted = [...completed].sort((a, b) =>
        a.summary.toLowerCase().localeCompare(b.summary.toLowerCase())
      );
      for (const item of sortedCompleted) {
        html += `
          <div class="og-item completed" data-uid="${this._escAttr(item.uid)}">
            <span class="og-item-name">${this._escHtml(item.summary)}</span>
            <div class="og-item-actions">
              <button class="og-item-menu-btn" data-uid="${this._escAttr(item.uid)}" aria-label="Edit ${this._escAttr(item.summary)}">
                <svg viewBox="0 0 24 24"><circle cx="5" cy="12" r="2" fill="currentColor"/><circle cx="12" cy="12" r="2" fill="currentColor"/><circle cx="19" cy="12" r="2" fill="currentColor"/></svg>
              </button>
            </div>
          </div>
        `;
      }
    }

    listEl.innerHTML = html;

    // Three-dot buttons now open edit view
    listEl.querySelectorAll('.og-item-menu-btn').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        this._showEditView(btn.getAttribute('data-uid'));
      });
    });
  }

  _groupByCategory(items) {
    const groups = {};
    for (const item of items) {
      const cat = this._masterCategories[item.summary.trim().toLowerCase()] || 'Uncategorized';
      if (!groups[cat]) groups[cat] = [];
      groups[cat].push(item);
    }
    return groups;
  }

  /* ---- Add / Remove ---- */

  _handleAdd() {
    const input = this.shadowRoot.getElementById('og-input');
    const summary = input.value.trim();
    if (!summary) return;

    this._hideAutocomplete();
    input.value = '';
    this._addItem(summary);
  }

  async _addItem(summary) {
    if (!this._hass) return;
    try {
      await this._hass.callService('todo', 'add_item', {
        item: summary,
      }, { entity_id: this._config.entity });
      this._addToHistory(summary);
      this._showStatus(`Added "${summary}"`, 'success');
    } catch (err) {
      console.error('OG Kiosk: add item failed', err);
      this._showStatus(`Failed to add "${summary}"`, 'error');
    }
    const input = this.shadowRoot.getElementById('og-input');
    if (input) input.focus();
  }

  async _removeItem(uid) {
    if (!this._hass) return;
    const item = this._items.find((i) => i.uid === uid);
    const name = item ? item.summary : 'item';
    try {
      await this._hass.callService('todo', 'remove_item', {
        item: uid,
      }, { entity_id: this._config.entity });
      this._showStatus(`Removed "${name}"`, 'success');
    } catch (err) {
      console.error('OG Kiosk: remove item failed', err);
      this._showStatus(`Failed to remove "${name}"`, 'error');
    }
  }

  /* ---- Confirm dialog ---- */

  _showConfirm(uid, name) {
    this._pendingRemoveUid = uid;
    const overlay = this.shadowRoot.getElementById('og-confirm-overlay');
    const text = this.shadowRoot.getElementById('og-confirm-text');
    text.textContent = `Remove "${name}"?`;
    overlay.classList.remove('hidden');
  }

  _hideConfirm() {
    this._pendingRemoveUid = null;
    const overlay = this.shadowRoot.getElementById('og-confirm-overlay');
    if (overlay) overlay.classList.add('hidden');
  }

  /* ---- Autocomplete ---- */

  _updateAutocomplete() {
    const input = this.shadowRoot.getElementById('og-input');
    const dropdown = this.shadowRoot.getElementById('og-autocomplete');
    const query = input.value.trim().toLowerCase();

    const candidates = query.length < 1
      ? this._getRecentCandidates()
      : this._getAutocompleteCandidates(query);

    if (candidates.length === 0) {
      this._hideAutocomplete();
      return;
    }

    this._autocompleteIdx = -1;
    dropdown.innerHTML = '';

    candidates.slice(0, 10).forEach((c) => {
      const div = document.createElement('div');
      div.className = 'ac-item';
      let html = query.length > 0 ? this._highlightMatch(c.text, query) : this._escHtml(c.text);
      if (c.onList) html += '<span class="ac-on-list">(on list)</span>';
      div.innerHTML = html;
      div.addEventListener('click', () => {
        input.value = c.text;
        this._hideAutocomplete();
        this._handleAdd();
      });
      dropdown.appendChild(div);
    });

    dropdown.classList.add('open');
  }

  _hideAutocomplete() {
    const dropdown = this.shadowRoot && this.shadowRoot.getElementById('og-autocomplete');
    if (dropdown) {
      dropdown.classList.remove('open');
      dropdown.innerHTML = '';
    }
    this._autocompleteIdx = -1;
  }

  _moveAutocomplete(dir) {
    const dropdown = this.shadowRoot.getElementById('og-autocomplete');
    const items = dropdown.querySelectorAll('.ac-item');
    if (items.length === 0) return;

    items.forEach((it) => it.classList.remove('highlighted'));
    this._autocompleteIdx += dir;
    if (this._autocompleteIdx < 0) this._autocompleteIdx = items.length - 1;
    if (this._autocompleteIdx >= items.length) this._autocompleteIdx = 0;
    items[this._autocompleteIdx].classList.add('highlighted');
    items[this._autocompleteIdx].scrollIntoView({ block: 'nearest' });
  }

  /**
   * Build the unified pool of autocomplete items from master categories
   * (all items ever added to OurGroceries) plus localStorage history.
   * Master categories keys are lowercase; history provides proper casing.
   */
  _buildAutocompletePool() {
    const currentNamesLower = new Set(
      this._items
        .filter((i) => i.status === 'needs_action')
        .map((i) => i.summary.toLowerCase())
    );

    // Current item base names (lowercase, without quantity) — these are the
    // canonical names. We'll prefer these over stale master list entries.
    const currentBaseNames = new Set(
      this._items
        .filter((i) => i.status === 'needs_action')
        .map((i) => this._parseQuantity(i.summary.trim()).baseName.toLowerCase())
    );

    // Build a lowercase -> display-name map from history (preserves casing)
    const history = this._getHistory();
    const historyDisplay = {};
    for (const h of history) {
      const key = h.toLowerCase();
      if (!historyDisplay[key]) historyDisplay[key] = h;
    }

    // Deduplicate on base name (strip quantity suffixes like "(2)")
    const seenBase = new Set();
    const pool = [];

    const addEntry = (display) => {
      const base = this._parseQuantity(display).baseName.toLowerCase();
      if (seenBase.has(base)) return;
      seenBase.add(base);
      pool.push({ text: display, onList: currentNamesLower.has(display.toLowerCase()) });
    };

    // 1. Current list items first (these are the canonical names)
    for (const item of this._items) {
      if (item.status !== 'needs_action') continue;
      const baseName = this._parseQuantity(item.summary.trim()).baseName;
      addEntry(baseName);
    }

    // 2. Master categories (every item ever added, keys are lowercase)
    for (const key of Object.keys(this._masterCategories)) {
      const display = historyDisplay[key] || this._titleCase(key);
      addEntry(display);
    }

    // 3. History items not already covered
    for (const h of history) {
      addEntry(h);
    }

    return pool;
  }

  _getAutocompleteCandidates(query) {
    const pool = this._buildAutocompletePool();

    const scored = [];
    for (const entry of pool) {
      const score = this._fuzzyScore(entry.text, query);
      if (score > 0) {
        const adjusted = entry.onList ? score - 50 : score;
        scored.push({ text: entry.text, onList: entry.onList, score: adjusted });
      }
    }

    scored.sort((a, b) => b.score - a.score);
    return scored;
  }

  _getRecentCandidates() {
    const currentNamesLower = new Set(
      this._items
        .filter((i) => i.status === 'needs_action')
        .map((i) => i.summary.toLowerCase())
    );

    // For empty-input, show recent history (preserves recency order)
    const history = this._getHistory();
    const seen = new Set();
    const results = [];
    for (const h of history) {
      const key = h.toLowerCase();
      if (!seen.has(key)) {
        seen.add(key);
        results.push({ text: h, onList: currentNamesLower.has(key) });
      }
    }
    return results;
  }

  _titleCase(str) {
    return str.replace(/\b\w/g, (c) => c.toUpperCase());
  }

  _fuzzyScore(text, query) {
    const lower = text.toLowerCase();
    if (lower.startsWith(query)) return 100 + (1 / text.length);
    const words = lower.split(/\s+/);
    for (const w of words) {
      if (w.startsWith(query)) return 80 + (1 / text.length);
    }
    if (lower.includes(query)) return 60 + (1 / text.length);
    let qi = 0;
    for (let i = 0; i < lower.length && qi < query.length; i++) {
      if (lower[i] === query[qi]) qi++;
    }
    if (qi === query.length) return 20 + (qi / text.length);
    return 0;
  }

  _highlightMatch(text, query) {
    const lower = text.toLowerCase();
    const idx = lower.indexOf(query);
    if (idx >= 0) {
      return (
        this._escHtml(text.slice(0, idx)) +
        '<span class="ac-match">' +
        this._escHtml(text.slice(idx, idx + query.length)) +
        '</span>' +
        this._escHtml(text.slice(idx + query.length))
      );
    }
    return this._escHtml(text);
  }

  /* ---- History (localStorage) ---- */

  _getHistory() {
    try {
      const raw = localStorage.getItem(this._HISTORY_KEY);
      if (raw) return JSON.parse(raw);
    } catch (e) { /* ignore */ }
    return [];
  }

  _addToHistory(item) {
    if (!item || typeof item !== 'string') return;
    const trimmed = item.trim();
    if (!trimmed) return;
    try {
      let history = this._getHistory();
      history = history.filter((h) => h.toLowerCase() !== trimmed.toLowerCase());
      history.unshift(trimmed);
      if (history.length > this._MAX_HISTORY) history = history.slice(0, this._MAX_HISTORY);
      localStorage.setItem(this._HISTORY_KEY, JSON.stringify(history));
    } catch (e) { /* ignore */ }
  }

  _removeFromHistory(item) {
    if (!item || typeof item !== 'string') return;
    const baseName = this._parseQuantity(item.trim()).baseName.toLowerCase();
    try {
      let history = this._getHistory();
      history = history.filter((h) => {
        const hBase = this._parseQuantity(h).baseName.toLowerCase();
        return hBase !== baseName;
      });
      localStorage.setItem(this._HISTORY_KEY, JSON.stringify(history));
    } catch (e) { /* ignore */ }
  }

  /* ---- UID map (localStorage) ---- */

  _getUidMap() {
    try {
      const raw = localStorage.getItem(this._UID_MAP_KEY);
      if (raw) return JSON.parse(raw);
    } catch (e) { /* ignore */ }
    return {};
  }

  _saveUidMap(map) {
    try {
      localStorage.setItem(this._UID_MAP_KEY, JSON.stringify(map));
    } catch (e) { /* ignore */ }
  }

  /* ---- Status message ---- */

  _showStatus(message, type = 'success') {
    const el = this.shadowRoot && this.shadowRoot.getElementById('og-status');
    if (!el) return;
    if (this._statusTimeoutId) clearTimeout(this._statusTimeoutId);

    el.textContent = message;
    el.className = 'og-status ' + type;

    this._statusTimeoutId = setTimeout(() => {
      el.classList.add('hidden');
    }, 2500);
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
  description: 'Kitchen tablet kiosk card for managing OurGroceries lists via Home Assistant todo entities.',
  preview: true,
  documentationURL: '',
});

console.info(
  `%c OurGroceries Kiosk Card %c v${OG_CARD_VERSION} `,
  'background: #6B8E23; color: #fff; font-weight: bold; padding: 2px 6px; border-radius: 4px 0 0 4px;',
  'background: #C5A500; color: #fff; padding: 2px 6px; border-radius: 0 4px 4px 0;'
);
