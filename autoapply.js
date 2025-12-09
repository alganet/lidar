// SPDX-FileCopyrightText: 2025 Alexandre Gomes Gaigalas <alganet@gmail.com>
//
// SPDX-License-Identifier: ISC

// Lidar Auto-Apply Content Script
// Automatically applies matching rules when page content changes

(function () {
    // Prevent multiple injections
    if (window.__lidarAutoApplyInjected) return;
    window.__lidarAutoApplyInjected = true;

    let debounceTimer = null;
    let lastAppliedIds = new Set(); // Track what we've already applied this session
    let isProcessing = false;

    // Debounce delay (ms) - wait for DOM to settle
    const DEBOUNCE_DELAY = 1000;

    // Send message to background
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

    // Extract data from page using rule's selectors
    function extractData(rule) {
        const data = {};

        for (const field of rule.fields) {
            if (!field.selector) {
                data[field.name] = null;
                continue;
            }

            try {
                const el = document.querySelector(field.selector);
                if (el) {
                    if (el.tagName === 'A') {
                        data[field.name] = el.textContent?.trim();
                    } else if (el.tagName === 'IMG') {
                        data[field.name] = el.src || el.alt;
                    } else if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') {
                        data[field.name] = el.value;
                    } else {
                        data[field.name] = el.textContent?.trim();
                    }
                } else {
                    data[field.name] = null;
                }
            } catch (e) {
                data[field.name] = null;
            }
        }

        return data;
    }

    // Check if a rule is applicable (URL pattern and identifier selector matches)
    function isRuleApplicable(rule) {
        // Check URL pattern first
        if (!matchesUrlPattern(rule.urlPattern, window.location.href)) {
            return false;
        }

        const identifierField = rule.fields?.find(f => f.name === 'identifier');
        if (!identifierField?.selector) return false;

        try {
            const el = document.querySelector(identifierField.selector);
            return !!el;
        } catch (e) {
            return false;
        }
    }

    // Helper: Match URL against glob pattern
    function matchesUrlPattern(pattern, url) {
        if (!pattern) return true; // No pattern = match all (backwards compat)
        try {
            // Convert glob pattern to regex
            const escaped = pattern
                .replace(/[.+?^${}()|[\]\\]/g, '\\$&')
                .replace(/\*/g, '.*');
            const regex = new RegExp(`^${escaped}$`, 'i');
            return regex.test(url);
        } catch (e) {
            return false;
        }
    }

    // Generate a unique key for this page + rule + identifier value
    function getApplyKey(rule, identifier) {
        return `${rule.id}:${identifier}`;
    }

    // Auto-apply all matching rules
    async function autoApplyRules() {
        if (isProcessing) return;
        isProcessing = true;

        try {
            const rules = await sendMessage({ action: 'getRules' });
            if (rules.error || !Array.isArray(rules)) {
                isProcessing = false;
                return;
            }

            let appliedCount = 0;

            for (const rule of rules) {
                if (!isRuleApplicable(rule)) continue;

                const data = extractData(rule);

                // Skip if no identifier found
                if (!data.identifier) continue;

                // Skip if we've already applied this exact rule+identifier combo
                const applyKey = getApplyKey(rule, data.identifier);
                if (lastAppliedIds.has(applyKey)) continue;

                // Save the data
                try {
                    await sendMessage({
                        action: 'saveData',
                        ruleId: rule.id,
                        ruleName: rule.name,
                        data,
                        sourceUrl: window.location.href
                    });

                    lastAppliedIds.add(applyKey);
                    appliedCount++;
                } catch (e) {
                    console.error('Lidar: Error saving data for rule', rule.name, e);
                }
            }

            // Update badge if we applied any rules
            if (appliedCount > 0) {
                await sendMessage({
                    action: 'updateBadge',
                    count: appliedCount
                });
            }

        } catch (error) {
            console.error('Lidar: Auto-apply error', error);
        }

        isProcessing = false;
    }

    // Debounced handler for DOM changes
    function onDomChange() {
        if (debounceTimer) {
            clearTimeout(debounceTimer);
        }

        debounceTimer = setTimeout(() => {
            autoApplyRules();
        }, DEBOUNCE_DELAY);
    }

    // Set up MutationObserver
    const observer = new MutationObserver((mutations) => {
        // Filter out our own panel mutations
        const dominated = mutations.some(m => {
            const target = m.target;
            if (target.id === 'lidar-panel-host') return true;
            if (target.closest?.('#lidar-panel-host')) return true;
            return false;
        });

        if (dominated) return;

        // Only trigger on meaningful changes
        const hasMeaningfulChange = mutations.some(m => {
            // Ignore attribute changes on our elements
            if (m.type === 'attributes') {
                return !m.target.id?.startsWith('lidar');
            }
            // For childList/characterData, check it's not our panel
            return true;
        });

        if (hasMeaningfulChange) {
            onDomChange();
        }
    });

    // Start observing once DOM is ready
    function startObserving() {
        observer.observe(document.body, {
            childList: true,
            subtree: true,
            characterData: true,
            attributes: false // Don't watch attribute changes for performance
        });

        // Also run once on initial load
        autoApplyRules();
    }

    // Wait for body to be available
    if (document.body) {
        startObserving();
    } else {
        document.addEventListener('DOMContentLoaded', startObserving);
    }

    // Also trigger on URL changes (for SPAs)
    let lastUrl = location.href;
    new MutationObserver(() => {
        if (location.href !== lastUrl) {
            lastUrl = location.href;
            lastAppliedIds.clear(); // Reset on URL change
            onDomChange();
        }
    }).observe(document, { subtree: true, childList: true });

    // Clear badge when navigating away
    window.addEventListener('beforeunload', () => {
        sendMessage({ action: 'clearBadge' }).catch(() => { });
    });

})();
