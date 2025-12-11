// SPDX-FileCopyrightText: 2025 Alexandre Gomes Gaigalas <alganet@gmail.com>
//
// SPDX-License-Identifier: ISC

// Test setup file
const { TextEncoder, TextDecoder } = require('util');
require('fake-indexeddb/auto');

// Polyfills for Node.js environment
global.TextEncoder = TextEncoder;
global.TextDecoder = TextDecoder;

// Mock Chrome APIs for extension testing
global.chrome = {
  runtime: {
    id: 'test-extension-id',
    sendMessage: jest.fn(),
    onMessage: {
      addListener: jest.fn(),
      removeListener: jest.fn()
    },
    getURL: jest.fn((path) => `chrome-extension://test-extension-id/${path}`)
  },
  storage: {
    local: {
      get: jest.fn(),
      set: jest.fn(),
      remove: jest.fn(),
      clear: jest.fn()
    },
    sync: {
      get: jest.fn(),
      set: jest.fn(),
      remove: jest.fn(),
      clear: jest.fn()
    }
  },
  scripting: {
    executeScript: jest.fn(),
    insertCSS: jest.fn()
  },
  tabs: {
    query: jest.fn(),
    get: jest.fn(),
    update: jest.fn(),
    sendMessage: jest.fn()
  },
  action: {
    setBadgeText: jest.fn(),
    setBadgeBackgroundColor: jest.fn(),
    setTitle: jest.fn()
  },
  alarms: {
    create: jest.fn(),
    clear: jest.fn(),
    get: jest.fn(),
    getAll: jest.fn()
  },
  contextMenus: {
    create: jest.fn(),
    remove: jest.fn(),
    update: jest.fn()
  }
};


const { createMockCrypto } = require('./mocks/testHelpers');

// Mock crypto for encryption operations
global.crypto = createMockCrypto();

// Setup Lidar global object
global.Lidar = {
  messaging: {},
  db: {},
  rules: {},
  scraping: {},
  badge: {}
};

// Polyfill structuredClone for fake-indexeddb compatibility
if (typeof structuredClone === 'undefined') {
  global.structuredClone = (obj) => {
    // Simple polyfill using JSON for basic objects
    return JSON.parse(JSON.stringify(obj));
  };
}

// Mock DOM APIs for jsdom environment
if (typeof window !== 'undefined') {
  window.chrome = global.chrome;
  window.Lidar = global.Lidar;
  window.structuredClone = global.structuredClone;
}