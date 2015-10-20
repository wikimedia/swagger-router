"use strict";

// mocha defines to avoid JSHint breakage
/* global describe, it, before, beforeEach, after, afterEach */

var deepEqual = require('../utils/assert').deepEqual;
var utils = require('../../lib/utils');

describe('utils tests', function() {
    it('should correctly encode reserved expansion', function() {
        deepEqual(utils.encodeReserved('ä:/?#[]@!$&\'()*+,;=%2f'),
            '%C3%A4:/?#[]@!$&\'()*+,;=/');
    });
});