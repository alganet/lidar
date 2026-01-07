// SPDX-FileCopyrightText: 2025 Alexandre Gomes Gaigalas <alganet@gmail.com>
//
// SPDX-License-Identifier: ISC

// Centralized global object detection helper
// Ensures a single place to resolve `global/self/window` and to expose a
// small accessor `Lidar._getGlobal()` for other modules.

(function () {
    'use strict';

    let g;
    if (typeof global !== 'undefined' && global) {
        g = global;
    } else if (typeof self !== 'undefined' && self) {
        g = self;
    } else if (typeof window !== 'undefined' && window) {
        g = window;
    } else {
        g = this;
    }

    g.Lidar = g.Lidar || {};

    // Ensure a stable accessor for other modules and tests to call
    if (typeof g.Lidar._getGlobal !== 'function') {
        g.Lidar._getGlobal = function () { return g; };
    }

    // Also expose a raw global accessor so tests that replace `Lidar` won't lose
    // the ability to resolve the runtime global. This accessor intentionally
    // avoids using the `Lidar` namespace so it survives test overrides.
    if (typeof g.__getLidarGlobal !== 'function') {
        g.__getLidarGlobal = function () { return g; };
    }


}());