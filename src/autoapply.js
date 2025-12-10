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

    // Auto-apply all matching rules
    async function autoApplyRules() {
        if (isProcessing) return;
        isProcessing = true;

        try {
            const rules = await Lidar.messaging.sendMessage({ action: 'getRules' }, chrome.runtime);
            if (rules.error || !Array.isArray(rules)) {
                isProcessing = false;
                return;
            }

            let appliedCount = 0;

            for (const rule of rules) {
                if (!Lidar.scraping.isRuleApplicable(rule, window.location.href, document)) continue;

                const data = Lidar.scraping.extractData(rule, document);

                // Skip if no identifier found
                if (!data.identifier) continue;

                // Skip if we've already applied this exact rule+identifier combo
                const applyKey = Lidar.rules.getApplyKey(rule, data.identifier);
                if (lastAppliedIds.has(applyKey)) continue;

                // Save the data
                try {
                    await Lidar.messaging.sendMessage({
                        action: 'saveData',
                        ruleId: rule.id,
                        ruleName: rule.name,
                        data,
                        sourceUrl: window.location.href
                    }, chrome.runtime);

                    lastAppliedIds.add(applyKey);
                    appliedCount++;
                } catch (e) {
                    console.error('Lidar: Error saving data for rule', rule.name, e);
                }
            }

            // Update badge if we applied any rules
            if (appliedCount > 0) {
                await Lidar.messaging.sendMessage({
                    action: 'updateBadge',
                    count: appliedCount
                }, chrome.runtime);
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
        Lidar.messaging.sendMessage({ action: 'clearBadge' }, chrome.runtime).catch(() => { });
    });

    // Listen for rule updates from background (e.g. when panel creates/edits a rule)
    chrome.runtime.onMessage.addListener((message) => {
        if (message.action === 'rulesUpdated') {
            // Re-run auto-apply
            lastAppliedIds.clear(); // Changes might make previously ignored rules applicable or vice versa
            autoApplyRules();
        }
    });

})();
