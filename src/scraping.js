// SPDX-FileCopyrightText: 2025 Alexandre Gomes Gaigalas <alganet@gmail.com>
//
// SPDX-License-Identifier: ISC

// Lidar Scraping Module
// DOM interaction logic for scraping and identifying elements

(function () {
    'use strict';

    window.Lidar = window.Lidar || {};

    // Generate a unique CSS selector for an element
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

    // Extract data from page DOM based on rule selectors
    function extractData(rule, rootElement = document) {
        const data = {};

        for (const field of rule.fields) {
            if (!field.selector) {
                data[field.name] = null;
                continue;
            }

            try {
                const el = rootElement.querySelector(field.selector);
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
    function isRuleApplicable(rule, url, rootElement = document) {
        // Check URL pattern first
        if (window.Lidar.rules && !window.Lidar.rules.matchesUrlPattern(rule.urlPattern, url)) {
            return false;
        }

        const identifierField = rule.fields?.find(f => f.name === 'identifier');
        if (!identifierField?.selector) return false;

        try {
            const el = rootElement.querySelector(identifierField.selector);
            return !!el;
        } catch (e) {
            return false;
        }
    }

    window.Lidar.scraping = {
        generateSelector,
        extractData,
        isRuleApplicable
    };
})();
