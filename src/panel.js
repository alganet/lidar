// SPDX-FileCopyrightText: 2025 Alexandre Gomes Gaigalas <alganet@gmail.com>
//
// SPDX-License-Identifier: ISC

// Lidar Injected Panel
// Floating UI panel injected into web pages with Shadow DOM isolation

(async function () {
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
  let editingRuleId = null;
  let highlightOverlay = null;
  let currentBrowseRule = null;
  let currentBrowseData = [];
  // Simple editor state
  let isRegionPickerActive = false;
  let selectedRegionSelector = null;
  let selectedRegionHtml = null;
  let regionHighlightOverlay = null;

  // Configuration: Tag names considered as region containers for the region picker.
  // Extracted to a module-level constant for clarity and reuse.
  const REGION_CONTAINER_TAGS = ['TABLE', 'DIV', 'SECTION', 'ARTICLE', 'UL', 'OL', 'DL', 'MAIN', 'ASIDE'];

  // Confirmation messages used in the UI (extracted for easier modification/testing)
  const CONFIRM_MESSAGES = {
    clearData: 'Are you sure you want to clear all data for this rule?\nThis implies starting the list anew.',
    deleteRule: 'Delete this rule?',
    resolveRule: 'Are you sure you want to resolve this rule with the detected fields? This will also convert captured snapshots into permanent records.'
  };

  // Create the panel container
  const panelHost = document.createElement('div');
  panelHost.id = 'lidar-panel-host';
  const shadow = panelHost.attachShadow({ mode: 'closed' });

  // Load resources
  try {
    const cssUrl = chrome.runtime.getURL('src/panel.css');
    const htmlUrl = chrome.runtime.getURL('src/panel.html');

    // Inject CSS
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = cssUrl;
    shadow.appendChild(link);

    // Fetch and inject HTML
    const response = await fetch(htmlUrl);
    if (!response.ok) throw new Error('Failed to load panel HTML');
    const html = await response.text();

    const wrapper = document.createElement('div');
    wrapper.innerHTML = html;
    shadow.appendChild(wrapper);

    // Fetch and inject Sprites
    const spritesUrl = chrome.runtime.getURL('icons/sprites.svg');
    const spritesResponse = await fetch(spritesUrl);
    if (spritesResponse.ok) {
      const spritesHtml = await spritesResponse.text();
      const spritesWrapper = document.createElement('div');
      spritesWrapper.innerHTML = spritesHtml;
      shadow.appendChild(spritesWrapper);
    }

    document.body.appendChild(panelHost);
  } catch (err) {
    console.error('Lidar: Failed to initialize panel', err);
    return;
  }

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
  const exportBtn = shadow.getElementById('exportBtn');
  const clearDataBtn = shadow.getElementById('clearDataBtn');
  const previewView = shadow.getElementById('previewView');
  const previewFields = shadow.getElementById('previewFields');
  const previewUrlValue = shadow.getElementById('previewUrlValue');
  const refreshPreviewBtn = shadow.getElementById('refreshPreviewBtn');
  const confirmAcceptBtn = shadow.getElementById('confirmAcceptBtn');

  // Templates
  const templateRuleCard = shadow.getElementById('template-rule-card');
  const templateLearningCard = shadow.getElementById('template-learning-card');
  const templateEmptyRules = shadow.getElementById('template-empty-rules');
  const templateFieldItem = shadow.getElementById('template-field-item');
  const templateDataCard = shadow.getElementById('template-data-card');
  const templateDataField = shadow.getElementById('template-data-field');
  const templatePreviewField = shadow.getElementById('template-preview-field');

  // Simple Editor elements
  const simpleEditorView = shadow.getElementById('simpleEditorView');
  const simpleRuleName = shadow.getElementById('simpleRuleName');
  const simpleUrlPattern = shadow.getElementById('simpleUrlPattern');
  const regionStatus = shadow.getElementById('regionStatus');
  const selectRegionBtn = shadow.getElementById('selectRegionBtn');
  const simpleCancelBtn = shadow.getElementById('simpleCancelBtn');
  const showAdvancedBtn = shadow.getElementById('showAdvancedBtn');
  const simpleSaveBtn = shadow.getElementById('simpleSaveBtn');

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

  // View management
  function showView(view) {
    listView.classList.toggle('active', view === 'list');
    editorView.classList.toggle('active', view === 'editor');
    browseView.classList.toggle('active', view === 'browse');
    simpleEditorView.classList.toggle('active', view === 'simpleEditor');
    previewView.classList.toggle('active', view === 'preview');
    backBtn.style.display = view === 'list' ? 'none' : 'flex';

    if (view === 'list') {
      loadRules();
      editingRuleId = null;
      stopPicker();
      stopRegionPicker();
    }
  }

  // Load rules and auto-apply applicable ones
  async function loadRules() {
    try {
      const rules = await Lidar.messaging.sendMessage({ action: 'getRules' }, chrome.runtime);
      if (rules.error) throw new Error(rules.error);

      // Check applicability only (for UI)
      const rulesWithStatus = await Promise.all(rules.map(async (rule) => {
        const identifierField = rule.fields.find(f => f.name === 'identifier');
        let isApplicable = false;

        // Check URL pattern first
        if (!Lidar.rules.matchesUrlPattern(rule.urlPattern, window.location.href)) {
          return { ...rule, isApplicable: false };
        }

        if (identifierField?.selector) {
          try {
            const el = document.querySelector(identifierField.selector);
            isApplicable = !!el;
          } catch {
            isApplicable = false;
          }
        }

        return { ...rule, isApplicable };
      }));

      // Sort: applicable first, then by name
      const sortedRules = Lidar.rules.sortRules(rulesWithStatus);

      // Reset status bar (no longer showing applied count on load)
      statusBar.textContent = '';
      statusBar.className = 'status-bar';

      renderRulesList(sortedRules);
    } catch (error) {
      showStatus(`Error: ${error.message}`, 'error');
    }
  }

  function renderRulesList(rules) {
    rulesList.innerHTML = '';

    if (rules.length === 0) {
      rulesList.appendChild(templateEmptyRules.content.cloneNode(true));
      return;
    }

    rules.forEach(rule => {
      // Check if rule is in learning state
      const isLearning = rule.state === 'learning';
      const template = isLearning ? templateLearningCard : templateRuleCard;
      const clone = template.content.cloneNode(true);
      const card = clone.querySelector('.rule-card');

      if (!isLearning && rule.isApplicable) card.classList.add('applicable');
      card.dataset.id = rule.id;

      clone.querySelector('.rule-name').textContent = rule.name;

      if (isLearning) {
        // Setup actions
        const previewBtn = clone.querySelector('.preview-rule-btn');

        previewBtn.dataset.id = rule.id;
        previewBtn.addEventListener('click', () => handlePreview(rule.id));

        clone.querySelector('.delete-btn').dataset.id = rule.id;
        clone.querySelector('.delete-btn').addEventListener('click', () => deleteRule(rule.id));
      } else {
        // Resolved card: normal display
        const metaText = `${rule.fields?.length || 0} field${rule.fields?.length !== 1 ? 's' : ''}${rule.isApplicable ? ' • matches this page' : ''}`;
        clone.querySelector('.rule-meta').textContent = metaText;

        // Setup actions
        clone.querySelector('.browse-btn').dataset.id = rule.id;
        clone.querySelector('.browse-btn').addEventListener('click', async () => {
          const r = await Lidar.messaging.sendMessage({ action: 'getRule', id: rule.id }, chrome.runtime);
          if (!r.error) showBrowse(r);
        });

        clone.querySelector('.edit-btn').dataset.id = rule.id;
        clone.querySelector('.edit-btn').addEventListener('click', async () => {
          const r = await Lidar.messaging.sendMessage({ action: 'getRule', id: rule.id }, chrome.runtime);
          if (!r.error) showEditor(r);
        });

        clone.querySelector('.delete-btn').dataset.id = rule.id;
        clone.querySelector('.delete-btn').addEventListener('click', () => deleteRule(rule.id));
      }

      rulesList.appendChild(clone);
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
    const clone = templateFieldItem.content.cloneNode(true);
    const item = clone.querySelector('.field-item');
    item.dataset.field = fieldId;

    if (isIdentifier) {
      clone.querySelector('.field-name-display').style.display = 'block';
      clone.querySelector('.field-name-edit').style.display = 'none';
    } else {
      const nameInput = clone.querySelector('.field-name-input');
      nameInput.dataset.field = fieldId;
      nameInput.value = name;

      const removeBtn = clone.querySelector('.remove-field-btn');
      removeBtn.dataset.field = fieldId;
      removeBtn.addEventListener('click', () => item.remove());
    }

    const selectorInput = clone.querySelector('.selector-input');
    selectorInput.dataset.field = fieldId;
    selectorInput.value = selector;
    if (selector) selectorInput.classList.add('has-value');

    const pickBtn = clone.querySelector('.btn-pick');
    pickBtn.dataset.field = fieldId;
    pickBtn.addEventListener('click', () => startPicker(fieldId));

    fieldsList.appendChild(clone);
  }

  // Simple Editor
  function showSimpleEditor() {
    simpleRuleName.value = '';
    simpleUrlPattern.value = `${window.location.origin}/*`;
    selectedRegionSelector = null;
    selectedRegionHtml = null;
    updateRegionStatus();
    showView('simpleEditor');
  }

  function updateRegionStatus() {
    if (selectedRegionSelector) {
      regionStatus.classList.add('has-region');
      regionStatus.innerHTML = `<span class="region-selector-display">${selectedRegionSelector}</span>`;
    } else {
      regionStatus.classList.remove('has-region');
      regionStatus.innerHTML = '<span class="region-status-text">No region selected</span>';
    }
  }

  // Region Picker
  function createRegionHighlightOverlay() {
    if (regionHighlightOverlay) return;

    regionHighlightOverlay = document.createElement('div');
    regionHighlightOverlay.className = 'region-highlight-overlay';
    regionHighlightOverlay.style.cssText = `
      position: fixed;
      pointer-events: none;
      background: rgba(251, 191, 36, 0.2);
      border: 2px dashed #fbbf24;
      border-radius: 4px;
      z-index: 2147483645;
      transition: all 0.1s ease;
      display: none;
    `;
    document.body.appendChild(regionHighlightOverlay);
  }

  let regionPickerTarget = null;

  function handleRegionPickerMove(e) {
    if (!isRegionPickerActive) return;

    const target = e.target;
    if (target === regionHighlightOverlay || target === panelHost || panelHost.contains(target)) return;

    // Prefer container elements
    let selectedTarget = target;
    if (!REGION_CONTAINER_TAGS.includes(target.tagName)) {
      // Look for a nearby container parent
      let parent = target.parentElement;
      for (let i = 0; i < 3 && parent; i++) {
        if (REGION_CONTAINER_TAGS.includes(parent.tagName)) {
          selectedTarget = parent;
          break;
        }
        parent = parent.parentElement;
      }
    }

    regionPickerTarget = selectedTarget;
    const rect = selectedTarget.getBoundingClientRect();

    regionHighlightOverlay.style.display = 'block';
    regionHighlightOverlay.style.top = `${rect.top}px`;
    regionHighlightOverlay.style.left = `${rect.left}px`;
    regionHighlightOverlay.style.width = `${rect.width}px`;
    regionHighlightOverlay.style.height = `${rect.height}px`;
  }

  function handleRegionPickerClick(e) {
    if (!isRegionPickerActive) return;
    if (e.target === panelHost || panelHost.contains(e.target)) return;

    e.preventDefault();
    e.stopPropagation();

    if (regionPickerTarget) {
      selectedRegionSelector = Lidar.scraping.generateSelector(regionPickerTarget);
      selectedRegionHtml = regionPickerTarget.outerHTML;
      updateRegionStatus();
      showStatus('Region selected!', 'success');
      stopRegionPicker();
    }
  }

  function handleRegionPickerKey(e) {
    if (e.key === 'Escape' && isRegionPickerActive) {
      stopRegionPicker();
      showStatus('Region picker cancelled', 'warning');
    }
  }

  function startRegionPicker() {
    if (isRegionPickerActive) stopRegionPicker();

    isRegionPickerActive = true;
    createRegionHighlightOverlay();

    document.addEventListener('mousemove', handleRegionPickerMove, true);
    document.addEventListener('click', handleRegionPickerClick, true);
    document.addEventListener('keydown', handleRegionPickerKey, true);

    document.body.style.cursor = 'crosshair';
    selectRegionBtn.classList.add('active');
    selectRegionBtn.innerHTML = `<svg width="12" height="12"><use href="#icon-picking"/></svg> Selecting...`;

    showStatus('Click on the data region. Press Escape to cancel.', 'warning');
  }

  function stopRegionPicker() {
    isRegionPickerActive = false;

    if (regionHighlightOverlay) {
      regionHighlightOverlay.style.display = 'none';
    }

    document.removeEventListener('mousemove', handleRegionPickerMove, true);
    document.removeEventListener('click', handleRegionPickerClick, true);
    document.removeEventListener('keydown', handleRegionPickerKey, true);

    document.body.style.cursor = '';

    if (selectRegionBtn) {
      selectRegionBtn.classList.remove('active');
      selectRegionBtn.innerHTML = `<svg width="12" height="12"><use href="#icon-cursor"/></svg> Select Region`;
    }

    regionPickerTarget = null;
  }

  // Simple editor event handlers
  createNewBtn.addEventListener('click', () => showSimpleEditor());
  selectRegionBtn.addEventListener('click', () => startRegionPicker());
  simpleCancelBtn.addEventListener('click', () => showView('list'));

  showAdvancedBtn.addEventListener('click', () => {
    // Transfer values to advanced editor
    ruleName.value = simpleRuleName.value;
    urlPattern.value = simpleUrlPattern.value;
    showEditor();
  });

  simpleSaveBtn.addEventListener('click', async () => {
    const name = simpleRuleName.value.trim();
    if (!name) {
      showStatus('Please enter a rule name', 'error');
      return;
    }

    if (!selectedRegionSelector) {
      showStatus('Please select a data region', 'error');
      return;
    }

    const urlPatternValue = simpleUrlPattern.value.trim();
    if (!urlPatternValue) {
      showStatus('URL pattern is required', 'error');
      return;
    }

    try {
      const rule = {
        name,
        urlPattern: urlPatternValue,
        state: 'learning',
        regionSelector: selectedRegionSelector,
        fields: [],
        snapshots: selectedRegionHtml ? [{
          capturedAt: new Date().toISOString(),
          regionHtml: selectedRegionHtml,
          sourceUrl: window.location.href
        }] : []
      };
      await Lidar.messaging.sendMessage({ action: 'createRule', rule }, chrome.runtime);
      showStatus('Rule created! Visit pages to collect snapshots for field detection.', 'success');
      setTimeout(() => showView('list'), 1000);
    } catch (error) {
      showStatus(`Error: ${error.message}`, 'error');
    }
  });

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
        await Lidar.messaging.sendMessage({ action: 'updateRule', rule }, chrome.runtime);
        showStatus('Rule updated!', 'success');
      } else {
        await Lidar.messaging.sendMessage({ action: 'createRule', rule }, chrome.runtime);
        showStatus('Rule created!', 'success');
      }
      setTimeout(() => showView('list'), 500);
    } catch (error) {
      showStatus(`Error: ${error.message}`, 'error');
    }
  });

  // Browse
  async function showBrowse(rule) {
    currentBrowseRule = rule;
    browseTitle.textContent = rule.name;

    try {
      const data = await Lidar.messaging.sendMessage({ action: 'getDataByRule', ruleId: rule.id }, chrome.runtime);
      if (data.error) throw new Error(data.error);

      // Sort by date descending
      const sortedData = Lidar.rules.sortData(data);
      currentBrowseData = sortedData;

      browseCount.textContent = `${sortedData.length} record${sortedData.length !== 1 ? 's' : ''}`;

      if (sortedData.length === 0) {
        dataList.style.display = 'none';
        emptyState.style.display = 'flex';
        exportBtn.disabled = true;
        clearDataBtn.disabled = true;
      } else {
        dataList.style.display = 'flex';
        emptyState.style.display = 'none';
        exportBtn.disabled = false;
        clearDataBtn.disabled = false;

        dataList.innerHTML = '';

        // Show only last 50
        const displayData = sortedData.slice(0, 50);

        displayData.forEach(record => {
          const cardClone = templateDataCard.content.cloneNode(true);
          cardClone.querySelector('.data-identifier').textContent = record.identifier || 'Unknown';
          cardClone.querySelector('.data-date').textContent = formatDate(record.scrapedAt);

          const fieldsContainer = cardClone.querySelector('.data-fields');
          Object.entries(record.data || {}).forEach(([key, value]) => {
            const fieldClone = templateDataField.content.cloneNode(true);
            fieldClone.querySelector('.data-field-name').textContent = `${key}:`;
            fieldClone.querySelector('.data-field-value').textContent = String(value || '—');
            fieldsContainer.appendChild(fieldClone);
          });

          dataList.appendChild(cardClone);
        });

        if (sortedData.length > 50) {
          const moreInfo = document.createElement('div');
          moreInfo.style.textAlign = 'center';
          moreInfo.style.padding = '10px';
          moreInfo.style.color = '#606080';
          moreInfo.style.fontSize = '11px';
          moreInfo.textContent = `Showing recent 50 of ${sortedData.length} records. Export to see all.`;
          dataList.appendChild(moreInfo);
        }
      }
    } catch (error) {
      showStatus(`Error: ${error.message}`, 'error');
    }

    showView('browse');
  }

  exportBtn.addEventListener('click', () => {
    if (!currentBrowseData || currentBrowseData.length === 0) return;

    const blob = new Blob([JSON.stringify(currentBrowseData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${currentBrowseRule.name.replace(/[^a-z0-9]/gi, '_').toLowerCase()}_data.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  });

  clearDataBtn.addEventListener('click', async () => {
    if (!currentBrowseRule) return;
    if (!confirm(CONFIRM_MESSAGES.clearData)) return;

    try {
      await Lidar.messaging.sendMessage({ action: 'deleteDataByRule', ruleId: currentBrowseRule.id }, chrome.runtime);
      showStatus('Data cleared successfully', 'success');
      showBrowse(currentBrowseRule);
    } catch (error) {
      showStatus(`Error clearing data: ${error.message}`, 'error');
    }
  });

  // Delete rule
  async function deleteRule(id) {
    if (!confirm(CONFIRM_MESSAGES.deleteRule)) return;
    try {
      await Lidar.messaging.sendMessage({ action: 'deleteRule', id }, chrome.runtime);
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
      const selector = Lidar.scraping.generateSelector(pickerTarget);
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
      btn.innerHTML = `<svg width="12" height="12"><use href="#icon-picking"/></svg> Picking...`;
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
        btn.innerHTML = `<svg width="12" height="12"><use href="#icon-cursor"/></svg> Pick`;
      }
    }

    currentPickField = null;
    pickerTarget = null;
  }

  // Utilities
  function showStatus(message, type = '') {
    statusBar.textContent = message;
    statusBar.className = `status-bar ${type}`;
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

  async function handlePreview(ruleId) {
    showView('preview');
    runPreviewAnalysis(ruleId);
  }

  async function runPreviewAnalysis(ruleId) {
    confirmAcceptBtn.style.display = 'none';
    refreshPreviewBtn.disabled = true;
    refreshPreviewBtn.textContent = 'Analyzing...';
    previewFields.innerHTML = '<div class="loading-spinner">Analyzing snapshots...</div>';
    previewUrlValue.textContent = '...';

    try {
      const rule = await Lidar.messaging.sendMessage({ action: 'getRule', id: ruleId }, chrome.runtime);
      const snapshots = rule.snapshots || [];

      if (snapshots.length < 2) {
        previewFields.innerHTML = `
          <div class="empty-state">
            <svg width="40" height="40" style="opacity: 0.5;"><use href="#icon-box" /></svg>
            <p>Not enough data for analysis yet.</p>
            <p style="font-size: 11px; margin-top: 8px;">Please visit more similar pages to capture at least 2 consistent snapshots.</p>
          </div>
        `;
        refreshPreviewBtn.textContent = 'Refresh Analysis';
        refreshPreviewBtn.disabled = false;
        refreshPreviewBtn.onclick = () => runPreviewAnalysis(ruleId);
        return;
      }

      const result = Lidar.fieldDetection.detectFieldsFromSnapshots(snapshots);

      if (result.error) {
        previewFields.innerHTML = `<div class="error-state">${result.error}</div>`;
        refreshPreviewBtn.textContent = 'Retry Analysis';
        refreshPreviewBtn.disabled = false;
        refreshPreviewBtn.onclick = () => runPreviewAnalysis(ruleId);
        return;
      }

      // Render fields
      previewFields.innerHTML = '';
      result.fields.forEach(field => {
        const fieldClone = templatePreviewField.content.cloneNode(true);
        fieldClone.querySelector('.preview-field-name').textContent = field.name;
        fieldClone.querySelector('.preview-field-values').textContent = field.sampleValues.join(', ');
        previewFields.appendChild(fieldClone);
      });

      previewUrlValue.textContent = result.urlPattern;

      // Setup actions
      confirmAcceptBtn.style.display = 'block';
      confirmAcceptBtn.onclick = () => handleAccept(ruleId, result);

      refreshPreviewBtn.textContent = 'Refresh Analysis';
      refreshPreviewBtn.disabled = false;
      refreshPreviewBtn.onclick = () => runPreviewAnalysis(ruleId);

      showStatus('Fields detected successfully!', 'success');
    } catch (error) {
      previewFields.innerHTML = `<div class="error-state">Error: ${error.message}</div>`;
      refreshPreviewBtn.textContent = 'Retry Analysis';
      refreshPreviewBtn.disabled = false;
      refreshPreviewBtn.onclick = () => runPreviewAnalysis(ruleId);
    }
  }

  async function handleAccept(ruleId, result) {
    if (!confirm(CONFIRM_MESSAGES.resolveRule)) return;

    confirmAcceptBtn.disabled = true;
    confirmAcceptBtn.textContent = 'Resolving...';

    try {
      // 1. Fetch the rule to get snapshots
      const rule = await Lidar.messaging.sendMessage({ action: 'getRule', id: ruleId }, chrome.runtime);
      if (rule.error) throw new Error(rule.error);

      // 2. Convert existing snapshots to permanent records
      if (rule.snapshots && rule.snapshots.length > 0) {
        showStatus(`Converting ${rule.snapshots.length} snapshots...`, 'warning');

        // Prepare normalized fields for extraction
        const extractionFields = result.fields.map(f => ({
          name: f.name === result.identifier ? 'identifier' : f.name,
          selector: f.selector
        }));

        for (const snapshot of rule.snapshots) {
          const doc = new DOMParser().parseFromString(snapshot.regionHtml, 'text/html');
          const region = doc.body.firstElementChild || doc.body;

          const scrapedData = Lidar.scraping.extractData({ fields: extractionFields }, region);

          await Lidar.messaging.sendMessage({
            action: 'saveData',
            ruleId: rule.id,
            ruleName: rule.name,
            data: scrapedData,
            sourceUrl: snapshot.sourceUrl
          }, chrome.runtime);
        }
      }

      // 3. Resolve the rule
      await Lidar.messaging.sendMessage({
        action: 'resolveRule',
        ruleId,
        fields: result.fields,
        identifier: result.identifier,
        urlPattern: result.urlPattern
      }, chrome.runtime);

      showStatus('Rule resolved and data converted!', 'success');
      showView('list');
    } catch (error) {
      showStatus(`Error resolving rule: ${error.message}`, 'error');
      confirmAcceptBtn.disabled = false;
      confirmAcceptBtn.textContent = 'Accept & Resolve Rule';
    }
  }

})();
