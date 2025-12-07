// SPDX-FileCopyrightText: 2025 Alexandre Gomes Gaigalas <alganet@gmail.com>
//
// SPDX-License-Identifier: ISC

// Lidar Injected Panel
// Floating UI panel injected into web pages with Shadow DOM isolation

(function () {
  // If already injected, toggle visibility instead
  if (window.__lidarPanelInjected) {
    if (window.__lidarTogglePanel) {
      window.__lidarTogglePanel();
    }
    return;
  }
  window.__lidarPanelInjected = true;

  // State
  let isPickerActive = false;
  let currentPickField = null;
  let currentView = 'list';
  let editingRuleId = null;
  let highlightOverlay = null;

  // Create the panel container
  const panelHost = document.createElement('div');
  panelHost.id = 'lidar-panel-host';
  const shadow = panelHost.attachShadow({ mode: 'closed' });

  // Inject styles
  const styles = document.createElement('style');
  styles.textContent = `
    :host {
      all: initial;
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    }

    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }

    .panel {
      position: fixed;
      top: 20px;
      right: 20px;
      width: 360px;
      max-height: calc(100vh - 40px);
      background: #0f0f1a;
      border: 1px solid rgba(255, 255, 255, 0.1);
      border-radius: 16px;
      box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4), 0 0 0 1px rgba(255, 255, 255, 0.05);
      z-index: 2147483646;
      display: flex;
      flex-direction: column;
      overflow: hidden;
      font-size: 14px;
      color: #f0f0ff;
    }

    .panel.hidden {
      display: none;
    }

    .panel.minimized {
      width: auto;
      max-height: none;
    }

    .panel.minimized .panel-body {
      display: none;
    }

    /* Header */
    .panel-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 12px 16px;
      background: #1a1a2e;
      border-bottom: 1px solid rgba(255, 255, 255, 0.08);
      cursor: move;
      user-select: none;
    }

    .panel-title {
      display: flex;
      align-items: center;
      gap: 10px;
    }

    .panel-title svg {
      flex-shrink: 0;
    }

    .panel-title span {
      font-size: 16px;
      font-weight: 700;
      background: linear-gradient(135deg, #818cf8 0%, #c084fc 100%);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      background-clip: text;
    }

    .panel-controls {
      display: flex;
      gap: 8px;
    }

    .control-btn {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 28px;
      height: 28px;
      background: #252540;
      border: 1px solid rgba(255, 255, 255, 0.1);
      border-radius: 6px;
      color: #a0a0c0;
      cursor: pointer;
      transition: all 0.15s ease;
    }

    .control-btn:hover {
      background: #818cf8;
      color: white;
      border-color: #818cf8;
    }

    .control-btn.close:hover {
      background: #f87171;
      border-color: #f87171;
    }

    /* Body */
    .panel-body {
      flex: 1;
      padding: 16px;
      overflow-y: auto;
      max-height: 400px;
    }

    /* Views */
    .view {
      display: none;
    }

    .view.active {
      display: block;
    }

    /* Rules List */
    .rules-list {
      display: flex;
      flex-direction: column;
      gap: 8px;
      margin-bottom: 16px;
    }

    .rule-card {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 12px;
      background: #1a1a2e;
      border: 1px solid rgba(255, 255, 255, 0.08);
      border-radius: 10px;
      transition: all 0.15s ease;
    }

    .rule-card:hover {
      background: #252540;
      border-color: #818cf8;
    }

    .rule-card.applicable {
      border-color: rgba(52, 211, 153, 0.3);
      background: rgba(52, 211, 153, 0.05);
    }

    .rule-info {
      display: flex;
      flex-direction: column;
      gap: 2px;
    }

    .rule-name-row {
      display: flex;
      align-items: center;
      gap: 6px;
    }

    .check-icon {
      flex-shrink: 0;
    }

    .rule-name {
      font-weight: 600;
      color: #f0f0ff;
    }

    .rule-meta {
      font-size: 11px;
      color: #606080;
    }

    .rule-actions {
      display: flex;
      gap: 6px;
    }

    /* Buttons */
    .btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
      padding: 8px 14px;
      font-size: 12px;
      font-weight: 500;
      border: none;
      border-radius: 8px;
      cursor: pointer;
      transition: all 0.15s ease;
      font-family: inherit;
    }

    .btn-primary {
      background: linear-gradient(135deg, #818cf8 0%, #c084fc 100%);
      color: white;
      box-shadow: 0 2px 8px rgba(129, 140, 248, 0.3);
    }

    .btn-primary:hover {
      transform: translateY(-1px);
      box-shadow: 0 4px 12px rgba(129, 140, 248, 0.4);
    }

    .btn-secondary {
      background: #252540;
      color: #a0a0c0;
      border: 1px solid rgba(255, 255, 255, 0.1);
    }

    .btn-secondary:hover {
      background: #1a1a2e;
      color: #f0f0ff;
      border-color: #818cf8;
    }

    .btn-sm {
      padding: 6px 10px;
      font-size: 11px;
    }

    .btn-full {
      width: 100%;
    }

    .btn-pick {
      background: #252540;
      color: #818cf8;
      border: 1px solid #818cf8;
      padding: 6px 10px;
      font-size: 11px;
    }

    .btn-pick:hover {
      background: #818cf8;
      color: white;
    }

    .btn-pick.active {
      background: #fbbf24;
      border-color: #fbbf24;
      color: #000;
      animation: pulse 1.5s infinite;
    }

    @keyframes pulse {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.7; }
    }

    .btn-danger {
      background: transparent;
      color: #f87171;
      border: 1px solid #f87171;
      padding: 6px 8px;
    }

    .btn-danger:hover {
      background: #f87171;
      color: white;
    }

    .btn-ghost {
      background: transparent;
      color: #a0a0c0;
    }

    .btn-ghost:hover {
      background: #252540;
      color: #f0f0ff;
    }

    /* Form */
    .form-group {
      margin-bottom: 16px;
    }

    .form-group label {
      display: block;
      font-size: 11px;
      font-weight: 500;
      color: #a0a0c0;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      margin-bottom: 6px;
    }

    input[type="text"] {
      width: 100%;
      padding: 10px 12px;
      background: #252540;
      border: 1px solid rgba(255, 255, 255, 0.1);
      border-radius: 8px;
      color: #f0f0ff;
      font-size: 13px;
      font-family: inherit;
      transition: all 0.15s ease;
    }

    input[type="text"]:focus {
      outline: none;
      border-color: #818cf8;
      box-shadow: 0 0 0 3px rgba(129, 140, 248, 0.2);
    }

    input[type="text"]::placeholder {
      color: #606080;
    }

    .field-hint {
      font-size: 10px;
      color: #606080;
      margin-top: 4px;
    }

    /* Fields */
    .fields-section {
      margin-top: 16px;
    }

    .fields-header {
      font-size: 11px;
      font-weight: 500;
      color: #a0a0c0;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      margin-bottom: 10px;
    }

    .fields-list {
      display: flex;
      flex-direction: column;
      gap: 10px;
      margin-bottom: 12px;
    }

    .field-item {
      padding: 10px;
      background: #1a1a2e;
      border: 1px solid rgba(255, 255, 255, 0.08);
      border-radius: 8px;
    }

    .field-header {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-bottom: 8px;
    }

    .field-name {
      font-weight: 500;
      color: #f0f0ff;
      font-size: 13px;
    }

    .field-badge {
      font-size: 9px;
      padding: 2px 6px;
      border-radius: 4px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      background: rgba(129, 140, 248, 0.2);
      color: #818cf8;
    }

    .field-name-input {
      flex: 1;
      padding: 6px 10px !important;
      font-size: 12px !important;
    }

    .field-controls {
      display: flex;
      gap: 8px;
      align-items: center;
    }

    .selector-input {
      flex: 1;
      padding: 8px 10px !important;
      font-size: 11px !important;
      font-family: 'Monaco', 'Menlo', monospace !important;
    }

    .selector-input.has-value {
      color: #34d399 !important;
    }

    .remove-field-btn {
      padding: 4px 6px !important;
    }

    /* Form Actions */
    .form-actions {
      display: flex;
      gap: 10px;
      justify-content: flex-end;
      padding-top: 12px;
      border-top: 1px solid rgba(255, 255, 255, 0.08);
      margin-top: 16px;
    }

    /* Browse View */
    .browse-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 12px;
    }

    .browse-header h3 {
      font-size: 14px;
      font-weight: 600;
    }

    .badge {
      font-size: 10px;
      padding: 4px 8px;
      background: #252540;
      border-radius: 12px;
      color: #a0a0c0;
    }

    .data-list {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    .data-card {
      padding: 10px;
      background: #1a1a2e;
      border: 1px solid rgba(255, 255, 255, 0.08);
      border-radius: 8px;
    }

    .data-card-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 8px;
      padding-bottom: 6px;
      border-bottom: 1px solid rgba(255, 255, 255, 0.05);
    }

    .data-identifier {
      font-weight: 600;
      color: #818cf8;
      font-size: 12px;
    }

    .data-date {
      font-size: 10px;
      color: #606080;
    }

    .data-fields {
      display: flex;
      flex-direction: column;
      gap: 4px;
    }

    .data-field {
      display: flex;
      gap: 8px;
      font-size: 11px;
    }

    .data-field-name {
      color: #606080;
      min-width: 70px;
    }

    .data-field-value {
      color: #f0f0ff;
      word-break: break-word;
    }

    /* Empty State */
    .empty-state {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 30px 20px;
      text-align: center;
      color: #606080;
    }

    .empty-state p {
      margin-top: 12px;
      font-size: 12px;
      max-width: 220px;
    }

    /* Status */
    .status-bar {
      padding: 8px 16px;
      background: #1a1a2e;
      border-top: 1px solid rgba(255, 255, 255, 0.08);
      text-align: center;
      font-size: 11px;
      color: #a0a0c0;
    }

    .status-bar.hidden {
      display: none;
    }

    .status-bar.success {
      background: rgba(52, 211, 153, 0.1);
      color: #34d399;
    }

    .status-bar.error {
      background: rgba(248, 113, 113, 0.1);
      color: #f87171;
    }

    .status-bar.warning {
      background: rgba(251, 191, 36, 0.1);
      color: #fbbf24;
    }

    /* Scrollbar */
    .panel-body::-webkit-scrollbar {
      width: 5px;
    }

    .panel-body::-webkit-scrollbar-track {
      background: #0f0f1a;
    }

    .panel-body::-webkit-scrollbar-thumb {
      background: #252540;
      border-radius: 3px;
    }
  `;

  // Panel HTML
  const panelHTML = `
    <div class="panel" id="lidarPanel">
      <div class="panel-header" id="panelHeader">
        <div class="panel-title">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <circle cx="12" cy="12" r="10" stroke="url(#lg)" stroke-width="2"/>
            <circle cx="12" cy="12" r="6" stroke="url(#lg)" stroke-width="2" opacity="0.7"/>
            <circle cx="12" cy="12" r="2" fill="url(#lg)"/>
            <defs>
              <linearGradient id="lg" x1="0" y1="0" x2="24" y2="24">
                <stop offset="0%" stop-color="#818cf8"/>
                <stop offset="100%" stop-color="#c084fc"/>
              </linearGradient>
            </defs>
          </svg>
          <span>Lidar</span>
        </div>
        <div class="panel-controls">
          <button class="control-btn" id="backBtn" title="Back" style="display: none;">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M19 12H5M12 19l-7-7 7-7"/>
            </svg>
          </button>
          <button class="control-btn close" id="closeBtn" title="Close">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M18 6L6 18M6 6l12 12"/>
            </svg>
          </button>
        </div>
      </div>

      <div class="panel-body">
        <!-- List View -->
        <div class="view active" id="listView">
          <div class="rules-list" id="rulesList"></div>
          <button class="btn btn-primary btn-full" id="createNewBtn">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M12 5v14M5 12h14"/>
            </svg>
            Create New Rule
          </button>
        </div>

        <!-- Editor View -->
        <div class="view" id="editorView">
          <div class="form-group">
            <label>Rule Name <span class="field-badge">required</span></label>
            <input type="text" id="ruleName" placeholder="e.g., Person, Product, Article">
          </div>

          <div class="form-group">
            <label>URL Pattern <span class="field-badge">required</span></label>
            <input type="text" id="urlPattern" placeholder="e.g., https://example.com/*">
            <div class="field-hint">Use * as wildcard. Matches pages where this rule applies.</div>
          </div>

          <div class="fields-section">
            <div class="fields-header">Fields</div>
            <div class="fields-list" id="fieldsList"></div>
            <button class="btn btn-secondary btn-full" id="addFieldBtn">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M12 5v14M5 12h14"/>
              </svg>
              Add Field
            </button>
          </div>

          <div class="form-actions">
            <button class="btn btn-ghost" id="cancelBtn">Cancel</button>
            <button class="btn btn-primary" id="saveBtn">Save Rule</button>
          </div>
        </div>

        <!-- Browse View -->
        <div class="view" id="browseView">
          <div class="browse-header">
            <h3 id="browseTitle">Data</h3>
            <span class="badge" id="browseCount">0 records</span>
          </div>
          <div class="data-list" id="dataList"></div>
          <div class="empty-state" id="emptyState" style="display: none;">
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.5">
              <path d="M20 6L9 17l-5-5"/>
            </svg>
            <p>No data yet. Apply this rule to a page to start collecting.</p>
          </div>
        </div>
      </div>

      <div class="status-bar hidden" id="statusBar"></div>
    </div>
  `;

  shadow.appendChild(styles);
  const wrapper = document.createElement('div');
  wrapper.innerHTML = panelHTML;
  shadow.appendChild(wrapper);

  document.body.appendChild(panelHost);

  // Get elements from shadow DOM
  const panel = shadow.getElementById('lidarPanel');
  const panelHeader = shadow.getElementById('panelHeader');
  const backBtn = shadow.getElementById('backBtn');

  const closeBtn = shadow.getElementById('closeBtn');
  const listView = shadow.getElementById('listView');
  const editorView = shadow.getElementById('editorView');
  const browseView = shadow.getElementById('browseView');
  const rulesList = shadow.getElementById('rulesList');
  const createNewBtn = shadow.getElementById('createNewBtn');
  const ruleName = shadow.getElementById('ruleName');
  const urlPattern = shadow.getElementById('urlPattern');
  const fieldsList = shadow.getElementById('fieldsList');
  const addFieldBtn = shadow.getElementById('addFieldBtn');
  const cancelBtn = shadow.getElementById('cancelBtn');
  const saveBtn = shadow.getElementById('saveBtn');
  const browseTitle = shadow.getElementById('browseTitle');
  const browseCount = shadow.getElementById('browseCount');
  const dataList = shadow.getElementById('dataList');
  const emptyState = shadow.getElementById('emptyState');
  const statusBar = shadow.getElementById('statusBar');

  // Make panel draggable
  let isDragging = false;
  let dragOffset = { x: 0, y: 0 };

  panelHeader.addEventListener('mousedown', (e) => {
    if (e.target.closest('.control-btn')) return;
    isDragging = true;
    dragOffset.x = e.clientX - panel.offsetLeft;
    dragOffset.y = e.clientY - panel.offsetTop;
    panel.style.transition = 'none';
  });

  document.addEventListener('mousemove', (e) => {
    if (!isDragging) return;
    const x = Math.max(0, Math.min(window.innerWidth - panel.offsetWidth, e.clientX - dragOffset.x));
    const y = Math.max(0, Math.min(window.innerHeight - panel.offsetHeight, e.clientY - dragOffset.y));
    panel.style.left = x + 'px';
    panel.style.top = y + 'px';
    panel.style.right = 'auto';
  });

  document.addEventListener('mouseup', () => {
    isDragging = false;
    panel.style.transition = '';
  });

  // Panel controls
  closeBtn.addEventListener('click', () => {
    panel.classList.add('hidden');
    stopPicker();
  });



  backBtn.addEventListener('click', () => showView('list'));

  // Helper: Match URL against glob pattern
  function matchesUrlPattern(pattern, url) {
    if (!pattern) return true; // No pattern = match all (backwards compat)
    try {
      // Convert glob pattern to regex
      // Escape special regex chars except *
      const escaped = pattern
        .replace(/[.+?^${}()|[\]\\]/g, '\\$&')
        .replace(/\*/g, '.*');
      const regex = new RegExp(`^${escaped}$`, 'i');
      return regex.test(url);
    } catch (e) {
      return false;
    }
  }

  // View management
  function showView(view) {
    currentView = view;
    listView.classList.toggle('active', view === 'list');
    editorView.classList.toggle('active', view === 'editor');
    browseView.classList.toggle('active', view === 'browse');
    backBtn.style.display = view === 'list' ? 'none' : 'flex';

    if (view === 'list') {
      loadRules();
      editingRuleId = null;
      stopPicker();
    }
  }

  // Load rules and auto-apply applicable ones
  async function loadRules() {
    try {
      const rules = await sendMessage({ action: 'getRules' });
      if (rules.error) throw new Error(rules.error);

      // Check applicability and auto-apply
      const rulesWithStatus = await Promise.all(rules.map(async (rule) => {
        const identifierField = rule.fields.find(f => f.name === 'identifier');
        let isApplicable = false;
        let applied = false;

        // Check URL pattern first
        if (!matchesUrlPattern(rule.urlPattern, window.location.href)) {
          return { ...rule, isApplicable: false, applied: false };
        }

        if (identifierField?.selector) {
          try {
            const el = document.querySelector(identifierField.selector);
            isApplicable = !!el;

            if (isApplicable) {
              // Auto-apply this rule
              const result = await applyRuleSilent(rule);
              applied = result.success;
            }
          } catch (e) {
            isApplicable = false;
          }
        }

        return { ...rule, isApplicable, applied };
      }));

      // Sort: applicable first, then by name
      rulesWithStatus.sort((a, b) => {
        if (a.isApplicable !== b.isApplicable) return b.isApplicable - a.isApplicable;
        return a.name.localeCompare(b.name);
      });

      // Count applied rules
      const appliedCount = rulesWithStatus.filter(r => r.applied).length;
      if (appliedCount > 0) {
        showStatus(`${appliedCount} rule${appliedCount !== 1 ? 's' : ''} applied`, 'success');
      }

      renderRulesList(rulesWithStatus);
    } catch (error) {
      showStatus(`Error: ${error.message}`, 'error');
    }
  }

  // Apply rule silently (no status updates, returns result)
  async function applyRuleSilent(rule) {
    try {
      const data = {};
      for (const field of rule.fields) {
        if (!field.selector) {
          data[field.name] = null;
          continue;
        }
        try {
          const el = document.querySelector(field.selector);
          if (el) {
            if (el.tagName === 'A') data[field.name] = el.href || el.textContent?.trim();
            else if (el.tagName === 'IMG') data[field.name] = el.src || el.alt;
            else if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') data[field.name] = el.value;
            else data[field.name] = el.textContent?.trim();
          } else {
            data[field.name] = null;
          }
        } catch (e) {
          data[field.name] = null;
        }
      }

      if (!data.identifier) {
        return { success: false, error: 'No identifier' };
      }

      await sendMessage({
        action: 'saveData',
        ruleId: rule.id,
        ruleName: rule.name,
        data,
        sourceUrl: window.location.href
      });

      return { success: true, data };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  function renderRulesList(rules) {
    if (rules.length === 0) {
      rulesList.innerHTML = `
        <div class="empty-state">
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.5">
            <rect x="3" y="3" width="18" height="18" rx="2"/>
            <path d="M12 8v8M8 12h8"/>
          </svg>
          <p>No rules yet. Create your first rule to start scraping.</p>
        </div>
      `;
      return;
    }

    rulesList.innerHTML = rules.map(rule => `
      <div class="rule-card ${rule.isApplicable ? 'applicable' : ''}" data-id="${rule.id}">
        <div class="rule-info">
          <div class="rule-name-row">
            ${rule.applied ? `
              <svg class="check-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#34d399" stroke-width="2.5">
                <path d="M20 6L9 17l-5-5"/>
              </svg>
            ` : ''}
            <span class="rule-name">${escapeHtml(rule.name)}</span>
          </div>
          <span class="rule-meta">${rule.fields.length} field${rule.fields.length !== 1 ? 's' : ''}${rule.isApplicable ? ' • matches this page' : ''}</span>
        </div>
        <div class="rule-actions">
          <button class="btn btn-secondary btn-sm browse-btn" data-id="${rule.id}" title="Browse collected data">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <ellipse cx="12" cy="5" rx="9" ry="3"/>
              <path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"/>
              <path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/>
            </svg>
          </button>
          <button class="btn btn-secondary btn-sm edit-btn" data-id="${rule.id}" title="Edit rule">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
            </svg>
          </button>
          <button class="btn btn-danger btn-sm delete-btn" data-id="${rule.id}" title="Delete rule">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
            </svg>
          </button>
        </div>
      </div>
    `).join('');

    // Setup action buttons
    rulesList.querySelectorAll('.browse-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const rule = await sendMessage({ action: 'getRule', id: btn.dataset.id });
        if (!rule.error) showBrowse(rule);
      });
    });

    rulesList.querySelectorAll('.edit-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const rule = await sendMessage({ action: 'getRule', id: btn.dataset.id });
        if (!rule.error) showEditor(rule);
      });
    });

    rulesList.querySelectorAll('.delete-btn').forEach(btn => {
      btn.addEventListener('click', () => deleteRule(btn.dataset.id));
    });
  }


  // Editor
  function showEditor(rule = null) {
    editingRuleId = rule?.id || null;
    ruleName.value = rule?.name || '';

    // Set URL pattern - default to current domain
    const defaultPattern = `${window.location.origin}/*`;
    urlPattern.value = rule?.urlPattern || defaultPattern;

    // Reset fields
    fieldsList.innerHTML = '';
    addField('identifier', rule?.fields?.find(f => f.name === 'identifier')?.selector || '', true);

    // Add other fields
    if (rule?.fields) {
      rule.fields.filter(f => f.name !== 'identifier').forEach(field => {
        addField(field.name, field.selector, false);
      });
    }

    showView('editor');
  }

  function addField(name = '', selector = '', isIdentifier = false) {
    const fieldId = isIdentifier ? 'identifier' : `field_${Date.now()}`;
    const fieldHtml = `
      <div class="field-item" data-field="${fieldId}">
        <div class="field-header">
          ${isIdentifier ? `
            <span class="field-name">ID</span>
            <span class="field-badge">required</span>
          ` : `
            <input type="text" class="field-name-input" data-field="${fieldId}" placeholder="Field name" value="${escapeHtml(name)}">
            <button class="btn btn-danger btn-sm remove-field-btn" data-field="${fieldId}">
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M18 6L6 18M6 6l12 12"/>
              </svg>
            </button>
          `}
        </div>
        <div class="field-controls">
          <input type="text" class="selector-input ${selector ? 'has-value' : ''}" data-field="${fieldId}" placeholder="Click Pick to select" value="${escapeHtml(selector)}" readonly>
          <button class="btn btn-pick" data-field="${fieldId}">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M5 3l14 9-14 9V3z"/>
            </svg>
            Pick
          </button>
        </div>
      </div>
    `;

    fieldsList.insertAdjacentHTML('beforeend', fieldHtml);

    // Setup handlers
    const fieldItem = fieldsList.querySelector(`.field-item[data-field="${fieldId}"]`);

    fieldItem.querySelector('.btn-pick')?.addEventListener('click', () => startPicker(fieldId));
    fieldItem.querySelector('.remove-field-btn')?.addEventListener('click', () => fieldItem.remove());
  }

  createNewBtn.addEventListener('click', () => showEditor());
  addFieldBtn.addEventListener('click', () => addField());
  cancelBtn.addEventListener('click', () => showView('list'));

  saveBtn.addEventListener('click', async () => {
    const name = ruleName.value.trim();
    if (!name) {
      showStatus('Please enter a rule name', 'error');
      return;
    }

    const fields = [];
    fieldsList.querySelectorAll('.field-item').forEach(item => {
      const fieldKey = item.dataset.field;
      const nameInput = item.querySelector('.field-name-input');
      const selectorInput = item.querySelector('.selector-input');

      const fieldName = fieldKey === 'identifier' ? 'identifier' : (nameInput?.value.trim() || '');
      const selector = selectorInput?.value.trim() || '';

      if (fieldName) {
        fields.push({ name: fieldName, selector, required: fieldKey === 'identifier' });
      }
    });

    const identifierField = fields.find(f => f.name === 'identifier');
    if (!identifierField?.selector) {
      showStatus('Identifier field must have a selector', 'error');
      return;
    }

    const urlPatternValue = urlPattern.value.trim();
    if (!urlPatternValue) {
      showStatus('URL pattern is required', 'error');
      return;
    }

    try {
      const rule = { id: editingRuleId, name, urlPattern: urlPatternValue, fields };
      if (editingRuleId) {
        await sendMessage({ action: 'updateRule', rule });
        showStatus('Rule updated!', 'success');
      } else {
        await sendMessage({ action: 'createRule', rule });
        showStatus('Rule created!', 'success');
      }
      setTimeout(() => showView('list'), 500);
    } catch (error) {
      showStatus(`Error: ${error.message}`, 'error');
    }
  });

  // Browse
  async function showBrowse(rule) {
    browseTitle.textContent = rule.name;

    try {
      const data = await sendMessage({ action: 'getDataByRule', ruleId: rule.id });
      if (data.error) throw new Error(data.error);

      browseCount.textContent = `${data.length} record${data.length !== 1 ? 's' : ''}`;

      if (data.length === 0) {
        dataList.style.display = 'none';
        emptyState.style.display = 'flex';
      } else {
        dataList.style.display = 'flex';
        emptyState.style.display = 'none';
        dataList.innerHTML = data.map(record => `
          <div class="data-card">
            <div class="data-card-header">
              <span class="data-identifier">${escapeHtml(record.identifier || 'Unknown')}</span>
              <span class="data-date">${formatDate(record.scrapedAt)}</span>
            </div>
            <div class="data-fields">
              ${Object.entries(record.data || {}).map(([key, value]) => `
                <div class="data-field">
                  <span class="data-field-name">${escapeHtml(key)}:</span>
                  <span class="data-field-value">${escapeHtml(String(value || '—'))}</span>
                </div>
              `).join('')}
            </div>
          </div>
        `).join('');
      }
    } catch (error) {
      showStatus(`Error: ${error.message}`, 'error');
    }

    showView('browse');
  }

  // Delete rule
  async function deleteRule(id) {
    if (!confirm('Delete this rule?')) return;
    try {
      await sendMessage({ action: 'deleteRule', id });
      showStatus('Rule deleted', 'success');
      loadRules();
    } catch (error) {
      showStatus(`Error: ${error.message}`, 'error');
    }
  }

  // Element Picker
  function createHighlightOverlay() {
    if (highlightOverlay) return;

    highlightOverlay = document.createElement('div');
    highlightOverlay.id = 'lidar-highlight';
    highlightOverlay.style.cssText = `
      position: fixed;
      pointer-events: none;
      background: rgba(99, 102, 241, 0.3);
      border: 2px solid #6366f1;
      border-radius: 4px;
      z-index: 2147483645;
      transition: all 0.1s ease;
      display: none;
    `;
    document.body.appendChild(highlightOverlay);
  }

  function generateSelector(element) {
    if (element.id && !element.id.startsWith('lidar')) {
      return `#${CSS.escape(element.id)}`;
    }

    const path = [];
    let current = element;

    while (current && current !== document.body) {
      let selector = current.tagName.toLowerCase();

      if (current.className && typeof current.className === 'string') {
        const classes = current.className.trim().split(/\s+/).filter(c => c && !c.startsWith('lidar'));
        if (classes.length > 0) {
          selector += '.' + classes.slice(0, 2).map(c => CSS.escape(c)).join('.');
        }
      }

      const parent = current.parentElement;
      if (parent) {
        const siblings = Array.from(parent.children).filter(el => el.tagName === current.tagName);
        if (siblings.length > 1) {
          const index = siblings.indexOf(current) + 1;
          selector += `:nth-of-type(${index})`;
        }
      }

      path.unshift(selector);
      current = current.parentElement;
    }

    return path.join(' > ');
  }

  let pickerTarget = null;

  function handlePickerMove(e) {
    if (!isPickerActive) return;

    const target = e.target;
    if (target === highlightOverlay || target === panelHost || panelHost.contains(target)) return;

    pickerTarget = target;
    const rect = target.getBoundingClientRect();

    highlightOverlay.style.display = 'block';
    highlightOverlay.style.top = `${rect.top}px`;
    highlightOverlay.style.left = `${rect.left}px`;
    highlightOverlay.style.width = `${rect.width}px`;
    highlightOverlay.style.height = `${rect.height}px`;
  }

  function handlePickerClick(e) {
    if (!isPickerActive) return;
    if (e.target === panelHost || panelHost.contains(e.target)) return;

    e.preventDefault();
    e.stopPropagation();

    if (pickerTarget) {
      const selector = generateSelector(pickerTarget);
      const preview = pickerTarget.textContent?.trim().substring(0, 50) || '';

      // Update the field
      const input = fieldsList.querySelector(`.selector-input[data-field="${currentPickField}"]`);
      if (input) {
        input.value = selector;
        input.classList.add('has-value');
        input.title = preview;
      }

      showStatus(`Captured: "${preview}${preview.length >= 50 ? '...' : ''}"`, 'success');
      stopPicker();
    }
  }

  function handlePickerKey(e) {
    if (e.key === 'Escape' && isPickerActive) {
      stopPicker();
      showStatus('Picker cancelled', 'warning');
    }
  }

  function startPicker(fieldId) {
    if (isPickerActive) stopPicker();

    isPickerActive = true;
    currentPickField = fieldId;

    createHighlightOverlay();

    document.addEventListener('mousemove', handlePickerMove, true);
    document.addEventListener('click', handlePickerClick, true);
    document.addEventListener('keydown', handlePickerKey, true);

    document.body.style.cursor = 'crosshair';

    // Update button
    const btn = fieldsList.querySelector(`.btn-pick[data-field="${fieldId}"]`);
    if (btn) {
      btn.classList.add('active');
      btn.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/></svg> Picking...`;
    }

    showStatus('Click an element to select it. Press Escape to cancel.', 'warning');
  }

  function stopPicker() {
    isPickerActive = false;

    if (highlightOverlay) {
      highlightOverlay.style.display = 'none';
    }

    document.removeEventListener('mousemove', handlePickerMove, true);
    document.removeEventListener('click', handlePickerClick, true);
    document.removeEventListener('keydown', handlePickerKey, true);

    document.body.style.cursor = '';

    // Reset button
    if (currentPickField) {
      const btn = fieldsList.querySelector(`.btn-pick[data-field="${currentPickField}"]`);
      if (btn) {
        btn.classList.remove('active');
        btn.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 3l14 9-14 9V3z"/></svg> Pick`;
      }
    }

    currentPickField = null;
    pickerTarget = null;
  }

  // Utilities
  function sendMessage(message) {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage(message, response => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else {
          resolve(response);
        }
      });
    });
  }

  function showStatus(message, type = '') {
    statusBar.textContent = message;
    statusBar.className = `status-bar ${type}`;
  }

  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  function formatDate(isoString) {
    const date = new Date(isoString);
    return date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  // Toggle panel visibility (called from popup)
  window.__lidarTogglePanel = function () {
    panel.classList.toggle('hidden');
    if (!panel.classList.contains('hidden')) {
      loadRules();
    }
  };

  // Show panel on load
  loadRules();

  // Listen for toggle message
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === 'togglePanel') {
      window.__lidarTogglePanel();
      sendResponse({ success: true });
    }
    return true;
  });

})();
