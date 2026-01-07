// SPDX-FileCopyrightText: 2025 Alexandre Gomes Gaigalas <alganet@gmail.com>
//
// SPDX-License-Identifier: ISC

// Lidar Scraping Module
// DOM interaction logic for scraping and identifying elements

(function () {
    'use strict';

    const globalObj = (typeof globalThis.__getLidarGlobal === 'function')
        ? globalThis.__getLidarGlobal()
        : ((typeof Lidar !== 'undefined' && typeof Lidar._getGlobal === 'function')
            ? Lidar._getGlobal()
            : (function () { throw new Error('Global accessor not initialized. Ensure src/global.js is loaded before this module.'); }()));

    /**
     * Get the meaningful value of an element for diffing and extraction.
     */
    function getElementValue(el) {
        if (!el) return '';
        const tagName = el.tagName;
        if (tagName === 'INPUT' || tagName === 'TEXTAREA' || tagName === 'SELECT') {
            return el.value || '';
        }
        if (tagName === 'IMG') {
            return el.src || el.alt || '';
        }
        return el.textContent?.trim() || '';
    }

    /**
     * Query an element relative to a root, handling over-specified selectors.
     */
    function scopedQuerySelector(root, selector) {
        if (selector === null || selector === undefined) return null;
        try {
            // Special case: empty string means the root element itself
            if (selector === '') return root;
            // 1. Try direct descendant match
            let el = root.querySelector(selector);
            if (el) return el;

            // 2. If it's a scoped root (not document)
            if (root !== document && root !== document.documentElement) {
                // Try :scope prefix (handles cases like "> table")
                try {
                    const scopeEl = root.querySelector(':scope ' + selector);
                    if (scopeEl) return scopeEl;
                } catch {
                    // Some environments (older jsdom or engines) may not support :scope or
                    // may throw for complex selectors. This is a best-effort helper so
                    // it's safe to ignore and proceed with fallback strategies.
                    void 0;
                }

                // Try stripping segments until we find the root in the selector
                // e.g. "html > body > center > table" with root being 'center'
                const segments = selector.split(' > ');
                for (let i = 0; i < segments.length; i++) {
                    try {
                        if (root.matches(segments[i])) {
                            // Found the root in the selector! Everything after it is our sub-selector.
                            const subSelector = segments.slice(i + 1).join(' > ');
                            if (!subSelector) return root; // Selector pointed exactly to root

                            const subEl = root.querySelector(subSelector);
                            if (subEl) return subEl;

                            // Try with :scope > just in case it's a direct child
                            const directEl = root.querySelector(':scope > ' + subSelector);
                            if (directEl) return directEl;
                        }
                    } catch {
                        // root.matches(...) may throw for certain selector syntaxes in some
                        // environments. This check is heuristic; ignore such errors and
                        // continue trying other fallback methods.
                        void 0;
                    }
                }
            }
            return null;
        } catch {
            return null;
        }
    }

    // Generate a unique CSS selector for an element
    function generateSelector(element, root = document.body) {
        // Use ID if available and not a lidar-internal ID, 
        // but only when generating a selector for the full document
        if (element.id && !element.id.startsWith('lidar') && root === document.body) {
            return `#${CSS.escape(element.id)}`;
        }

        const path = [];
        let current = element;

        while (current && current !== root) {
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

    // Extract data from page DOM based on rule selectors
    function extractData(rule, rootElement = document) {
        const data = {};

        for (const field of rule.fields) {
            const el = scopedQuerySelector(rootElement, field.selector);
            if (el) {
                data[field.name] = getElementValue(el);
            } else {
                data[field.name] = null;
            }
        }

        return data;
    }

    // Check if a rule applies to the current page
    function isRuleApplicable(rule, url, rootElement = document) {
        // Check URL pattern first
        if (globalObj.Lidar.rules && !globalObj.Lidar.rules.matchesUrlPattern(rule.urlPattern, url)) {
            return false;
        }

        const identifierField = rule.fields?.find(f => f.name === 'identifier');
        const el = scopedQuerySelector(rootElement, identifierField?.selector);
        return !!el;
    }

    globalObj.Lidar.scraping = {
        generateSelector,
        extractData,
        isRuleApplicable,
        getElementValue,
        scopedQuerySelector
    };
})();
