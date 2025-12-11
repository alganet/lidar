// SPDX-FileCopyrightText: 2025 Alexandre Gomes Gaigalas <alganet@gmail.com>
//
// SPDX-License-Identifier: ISC

// Create a mock crypto object
function createMockCrypto() {
    const makeFn = (fn) => (typeof jest !== 'undefined' ? jest.fn(fn) : fn);

    return {
        subtle: {
            digest: makeFn(() => {}),
            encrypt: makeFn(() => {}),
            decrypt: makeFn(() => {}),
            generateKey: makeFn(() => {}),
            importKey: makeFn(() => {})
        },
        getRandomValues: makeFn((arr) => {
            for (let i = 0; i < arr.length; i++) {
                arr[i] = Math.floor(Math.random() * 256);
            }
            return arr;
        }),
        randomUUID: makeFn(() => `mock-uuid-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`)
    };
}

module.exports = {
    createMockCrypto
};