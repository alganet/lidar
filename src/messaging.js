// SPDX-FileCopyrightText: 2025 Alexandre Gomes Gaigalas <alganet@gmail.com>
//
// SPDX-License-Identifier: ISC

// Lidar Messaging Module
// Chrome runtime messaging wrapper

(function () {
    'use strict';

    self.Lidar = self.Lidar || {};

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

    self.Lidar.messaging = {
        sendMessage
    };
})();
