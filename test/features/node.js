'use strict';

const deepEqual = require('assert').deepEqual;
const Node = require('../../lib/node');


describe('meta', () => {
    const n = new Node();
    const testKey = { type: 'meta', name: 'apiRoot' };
    const testValue = { foo: 'bar' };
    n.setChild(testKey, new Node(testValue));
    deepEqual(n.getChild(testKey).value, testValue);
    deepEqual(n.getChild(''), null);
});

