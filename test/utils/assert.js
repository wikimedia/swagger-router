'use strict';

var assert = require('assert');

/**
 * Asserts whether some requests in the given
 * slice were made to remote entities
 */
function deepEqual(result, expected, message) {
    try {
        if (typeof expected === 'string') {
            assert.ok(result === expected || (new RegExp(expected).test(result)));
        } else {
            assert.deepEqual(result, expected, message);
        }
    } catch (e) {
        console.log('Expected:\n' + JSON.stringify(expected,null,2));
        console.log('Result:\n' + JSON.stringify(result,null,2));
        throw e;
    }
}

module.exports.deepEqual = deepEqual;

