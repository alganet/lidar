// SPDX-FileCopyrightText: 2025 Alexandre Gomes Gaigalas <alganet@gmail.com>
//
// SPDX-License-Identifier: ISC

// Lidar Rules Module
// Pure logic for rule management and matching

(function () {
    'use strict';

    const globalObj = (typeof globalThis.__getLidarGlobal === 'function')
        ? globalThis.__getLidarGlobal()
        : ((typeof Lidar !== 'undefined' && typeof Lidar._getGlobal === 'function')
            ? Lidar._getGlobal()
            : (function () { throw new Error('Global accessor not initialized. Ensure src/global.js is loaded before this module.'); }()));

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
        } catch {
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

    /**
     * Crystallize a set of URLs into a common glob pattern.
     * Finds the longest common prefix that ends at a logical boundary (/, ?, &).
     */
    function crystallizeUrlPattern(urls) {
        if (!urls || urls.length === 0) return '';
        if (urls.length === 1) return urls[0];

        // Sort to find common prefix between first and last easily
        const sorted = [...urls].sort();
        const first = sorted[0];
        const last = sorted[sorted.length - 1];

        let i = 0;
        while (i < first.length && first[i] === last[i]) {
            i++;
        }

        let common = first.substring(0, i);

        // If common prefix is the whole string and all strings are equal
        if (common === first && sorted.every(u => u === first)) {
            return first;
        }

        // Backtrack to last safe boundary if we're in the middle of a word/segment
        // e.g. /user1 vs /user2 -> /user*
        // but /user/abc vs /user/def -> /user/*
        const lastSlash = common.lastIndexOf('/');
        const lastQuestion = common.lastIndexOf('?');
        const lastEqual = common.lastIndexOf('=');
        const lastAmp = common.lastIndexOf('&');

        const boundary = Math.max(lastSlash, lastQuestion, lastEqual, lastAmp);

        if (boundary > 8) { // After https://
            common = common.substring(0, boundary + 1);
            return common + '*';
        }

        return '*';
    }

    globalObj.Lidar.rules = {
        matchesUrlPattern,
        sortRules,
        sortData,
        getApplyKey,
        crystallizeUrlPattern
    };
})();
