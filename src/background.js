// SPDX-FileCopyrightText: 2025 Alexandre Gomes Gaigalas <alganet@gmail.com>
//
// SPDX-License-Identifier: ISC

// Lidar Background Service Worker
// Manages IndexedDB for rules and scraped data

// Load dependencies (MV3 service worker)
try {
    importScripts('db.js', 'badge.js');
} catch (e) {
    // Firefox MV2 loads scripts via manifest, not importScripts
    console.log('Scripts loaded via manifest');
}

// Message Handler
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    const handleAsync = async () => {
        try {
            switch (message.action) {
                case 'getRules':
                    return await Lidar.db.getRules(indexedDB);

                case 'getRule':
                    return await Lidar.db.getRule(message.id, indexedDB);

                case 'createRule':
                    return await Lidar.db.createRule(message.rule, indexedDB, crypto);

                case 'updateRule':
                    return await Lidar.db.updateRule(message.rule, indexedDB);

                case 'deleteRule':
                    return await Lidar.db.deleteRule(message.id, indexedDB);

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
});

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
                files: ['src/messaging.js', 'src/rules.js', 'src/scraping.js']
            });
            await chrome.scripting.executeScript({
                target: { tabId: tab.id },
                files: ['src/panel.js']
            });
        } else {
            // Fallback for Firefox/MV2
            // Inject dependencies sequentially
            const files = ['src/messaging.js', 'src/rules.js', 'src/scraping.js', 'src/panel.js'];
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
