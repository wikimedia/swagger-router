"use strict";


var deepEqual = require('../utils/assert').deepEqual;
var utils = require('../../lib/utils');

describe('utils tests',() => {
    it('should correctly encode reserved expansion',() => {
        deepEqual(utils.encodeReserved('ä:/?#[]@!$&\'()*+,;=%2f%20'),
            '%C3%A4:/?#[]@!$&\'()*+,;=%2f%20');
    });
});