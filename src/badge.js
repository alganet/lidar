// SPDX-FileCopyrightText: 2025 Alexandre Gomes Gaigalas <alganet@gmail.com>
//
// SPDX-License-Identifier: ISC

// Lidar Badge Module
// Browser extension badge management

(function () {
    'use strict';

    // Initialize Lidar namespace
    self.Lidar = self.Lidar || {};

    // Update badge with count
    function updateBadge(count, tabId, chromeApi) {
        const badgeApi = chromeApi.action || chromeApi.browserAction;
        const badgeText = count > 0 ? String(count) : '';

        // MV3 style (with tabId) or MV2 style
        if (badgeApi.setBadgeText.length > 1 || chromeApi.action) {
            badgeApi.setBadgeText({ text: badgeText, tabId: tabId });
            badgeApi.setBadgeBackgroundColor({ color: '#34d399', tabId: tabId });
        } else {
            badgeApi.setBadgeText({ text: badgeText });
            badgeApi.setBadgeBackgroundColor({ color: '#34d399' });
        }
    }

    // Clear badge
    function clearBadge(tabId, chromeApi) {
        const badgeApi = chromeApi.action || chromeApi.browserAction;

        if (badgeApi.setBadgeText.length > 1 || chromeApi.action) {
            badgeApi.setBadgeText({ text: '', tabId: tabId });
        } else {
            badgeApi.setBadgeText({ text: '' });
        }
    }

    // Export badge functions
    self.Lidar.badge = {
        updateBadge,
        clearBadge
    };
})();
