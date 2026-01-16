// SPDX-FileCopyrightText: 2025 Alexandre Gomes Gaigalas <alganet@gmail.com>
//
// SPDX-License-Identifier: ISC

// Lidar Background Service Worker
// Manages IndexedDB for rules and scraped data

// Load dependencies (MV3 service worker)
try {
    // Load the centralized global helper first so other scripts can use Lidar._getGlobal()
    importScripts('global.js', 'rules.js', 'scraping.js', 'fieldDetection.js', 'db.js', 'badge.js');
} catch (e) {
    console.error('Lidar: Failed to load background scripts:', e);
}

// Message Handler
function messageHandler(message, sender, sendResponse) {
    const handleAsync = async () => {
        try {
            switch (message.action) {
                case 'getRules':
                    return await Lidar.db.getRules(indexedDB);

                case 'getRule':
                    return await Lidar.db.getRule(message.id, indexedDB);

                case 'createRule': {
                    const createResult = await Lidar.db.createRule(message.rule, indexedDB, crypto);
                    broadcastRulesUpdated();
                    return createResult;
                }

                case 'updateRule': {
                    const updateResult = await Lidar.db.updateRule(message.rule, indexedDB);
                    broadcastRulesUpdated();
                    return updateResult;
                }

                case 'deleteRule': {
                    const deleteResult = await Lidar.db.deleteRule(message.id, indexedDB);
                    broadcastRulesUpdated();
                    return deleteResult;
                }

                case 'saveData':
                    return await Lidar.db.saveData(
                        message.ruleId,
                        message.ruleName,
                        message.data,
                        message.sourceUrl,
                        indexedDB,
                        crypto
                    );

                case 'getDataByRule':
                    return await Lidar.db.getDataByRule(message.ruleId, indexedDB);

                case 'deleteData':
                    return await Lidar.db.deleteData(message.id, indexedDB);

                case 'deleteDataByRule':
                    return await Lidar.db.deleteDataByRule(message.ruleId, indexedDB);

                case 'updateBadge':
                    if (sender.tab?.id) {
                        Lidar.badge.updateBadge(message.count || 0, sender.tab.id, chrome);
                    }
                    return { success: true };

                case 'clearBadge':
                    if (sender.tab?.id) {
                        Lidar.badge.clearBadge(sender.tab.id, chrome);
                    }
                    return { success: true };

                case 'addSnapshot': {
                    const snapshotResult = await Lidar.db.addSnapshot(
                        message.ruleId,
                        message.regionHtml,
                        message.sourceUrl,
                        indexedDB
                    );
                    broadcastRulesUpdated();
                    return { rule: snapshotResult };
                }


                case 'resolveRule': {
                    const resolveResult = await Lidar.db.resolveRule(
                        message.ruleId,
                        message.fields,
                        message.identifier,
                        message.urlPattern,
                        indexedDB
                    );
                    broadcastRulesUpdated();
                    return { rule: resolveResult };
                }

                case 'rulesUpdated':
                    broadcastRulesUpdated();
                    return { success: true };

                default:
                    throw new Error(`Unknown action: ${message.action}`);
            }
        } catch (error) {
            console.error('Background error:', error);
            return { error: error.message };
        }
    };

    handleAsync().then(sendResponse);
    return true; // Keep message channel open for async response
}

chrome.runtime.onMessage.addListener(messageHandler);

// Initialize DB on install
chrome.runtime.onInstalled.addListener(() => {
    Lidar.db.initDB(indexedDB).then(() => {
        console.log('Lidar: Database initialized');
    });
});

// Cross-browser compatibility for action API
const browserAction = chrome.action || chrome.browserAction;

// Handle extension icon click - inject panel directly
browserAction.onClicked.addListener(async (tab) => {
    // Check if we can inject into this tab
    const url = tab?.url || '';
    if (!tab?.id || url.startsWith('chrome://') || url.startsWith('chrome-extension://') ||
        url.startsWith('about:') || url.startsWith('moz-extension://')) {
        console.log('Cannot inject into this page');
        return;
    }

    try {
        // Use chrome.scripting (MV3) or chrome.tabs.executeScript (MV2/Firefox)
        if (chrome.scripting && chrome.scripting.executeScript) {
            // MV3: Need to inject utils first, then panel.js
            await chrome.scripting.executeScript({
                target: { tabId: tab.id },
                files: ['src/global.js', 'src/messaging.js', 'src/rules.js', 'src/scraping.js', 'src/fieldDetection.js']
            });
            await chrome.scripting.executeScript({
                target: { tabId: tab.id },
                files: ['src/panel.js']
            });
        } else {
            // Fallback for Firefox/MV2
            // Inject dependencies sequentially
            const files = ['src/global.js', 'src/messaging.js', 'src/rules.js', 'src/scraping.js', 'src/fieldDetection.js', 'src/panel.js'];
            for (const file of files) {
                await new Promise((resolve, reject) => {
                    chrome.tabs.executeScript(tab.id, { file }, () => {
                        if (chrome.runtime.lastError) {
                            reject(new Error(chrome.runtime.lastError.message));
                        } else {
                            resolve();
                        }
                    });
                });
            }
        }
    } catch (error) {
        console.error('Error injecting panel:', error);
    }
});

// Helper to broadcast rule updates to all tabs
function broadcastRulesUpdated() {
    chrome.tabs.query({}, (tabs) => {
        tabs.forEach(tab => {
            try {
                chrome.tabs.sendMessage(tab.id, { action: 'rulesUpdated' }, () => {
                    // Ignore errors (e.g. if tab doesn't have content script)
                    void chrome.runtime.lastError;
                });
            } catch {
                // Ignore errors
            }
        });
    });
}

// Export messageHandler for testing
if (typeof window !== 'undefined') {
    window.__lidarBackgroundMessageHandler = messageHandler;
}
