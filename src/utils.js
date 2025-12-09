// SPDX-FileCopyrightText: 2025 Alexandre Gomes Gaigalas <alganet@gmail.com>
//
// SPDX-License-Identifier: ISC

// Lidar Utilities
// Shared utilities for content scripts

(function() {
    'use strict';

    // Initialize Lidar namespace
    window.Lidar = window.Lidar || {};

    // Promisify chrome.runtime.sendMessage for easier async/await usage
    function sendMessage(message, runtime) {
        return new Promise((resolve, reject) => {
            runtime.sendMessage(message, response => {
                if (runtime.lastError) {
                    reject(new Error(runtime.lastError.message));
                } else {
                    resolve(response);
                }
            });
        });
    }

    // Check if a URL matches a glob pattern
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

    // Extract data from page DOM based on rule selectors
    function extractData(rule, document) {
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

    // Check if a rule applies to the current page
    function isRuleApplicable(rule, url, document) {
        // Check URL pattern first
        if (!matchesUrlPattern(rule.urlPattern, url)) {
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

    // Export utilities
    window.Lidar.utils = {
        sendMessage,
        matchesUrlPattern,
        extractData,
        isRuleApplicable
    };
})();
