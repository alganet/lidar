// SPDX-FileCopyrightText: 2025 Alexandre Gomes Gaigalas <alganet@gmail.com>
//
// SPDX-License-Identifier: ISC

// Lidar Rules Module
// Pure logic for rule management and matching

(function () {
    'use strict';

    self.Lidar = self.Lidar || {};

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

    // Sort rules: applicable first, then by name
    function sortRules(rules) {
        return [...rules].sort((a, b) => {
            if (a.isApplicable !== b.isApplicable) return b.isApplicable - a.isApplicable;
            return a.name.localeCompare(b.name);
        });
    }

    // Sort data: by scrapedAt descending
    function sortData(data) {
        return [...data].sort((a, b) => (b.scrapedAt || '').localeCompare(a.scrapedAt || ''));
    }

    // Generate a unique key for this page + rule + identifier value
    function getApplyKey(rule, identifier) {
        return `${rule.id}:${identifier}`;
    }

    self.Lidar.rules = {
        matchesUrlPattern,
        sortRules,
        sortData,
        getApplyKey
    };
})();
