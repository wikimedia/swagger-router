"use strict";

const P = require('bluebird');

// Work around recursive structure in ** terminal nodes
function printableValue(value) {
    const res = {};
    if (!value || !(value instanceof Object)) {
        return value;
    }
    Object.keys(value).forEach((key) => {
        const val = value[key];
        if (key === 'methods') {
            const newMethods = {};
            Object.keys(val).forEach((method) => {
                newMethods[method] = `<${val[method].name}>`;
            });
            res.methods = newMethods;
        } else if (key !== 'specRoot') {
            // Omit the specRoot, as it tends to be huge & contains reference
            // circles.
            res[key] = val;
        }
    });
    return res;
}

const _keyPrefix = '/';
const _keyPrefixRegExp = /^\//;

/*
 * A node in the lookup graph.
 *
 * We use a single monomorphic type for the JIT's benefit.
 */
class Node {
    constructor(value) {
        // The value for a path ending on this node. Public property.
        this.value = value || null;

        // Internal properties.
        this._children = {};
        this._paramName = null;
        this._parent = null;
    }

    setChild(key, child) {
        if (key.constructor === String) {
            this._children[_keyPrefix + key] = child;
        } else if (key.name && key.pattern
                && key.modifier !== '+'
                && key.pattern.constructor === String) {
            // A named but plain key.
            child._paramName = key.name;
            this._children[_keyPrefix + key.pattern] = child;
        } else if (key.modifier === '+') {
            child._paramName = key.name;
            this._children['**'] = child;
        } else {
            // Setting up a wildcard match
            child._paramName = key.name;
            this._children['*'] = child;
        }
    }

    getChild(segment, params) {
        if (segment.constructor === String) {
            // Fast path
            let res = this._children[_keyPrefix + segment];
            if (!res && segment !== '') {
                // Fall back to the wildcard match, but only if the segment is
                // non-empty.
                res = this._children['*'];
                if (!res && this._children['**']) {
                    res = this._children['**'];
                    // Build up an array for ** matches ({+foo})
                    if (params[res._paramName]) {
                        params[res._paramName] += `/${encodeURIComponent(segment)}`;
                    } else {
                        params[res._paramName] = encodeURIComponent(segment);
                    }
                    // We are done.
                    return res;
                }
            }

            if (res) {
                if (res._paramName) {
                    params[res._paramName] = segment;
                }
                return res;
            } else {
                return null;
            }

            // Fall-back cases for internal use during tree construction. These cases
            // are never used for actual routing.
        } else if (segment.pattern) {
            // Unwrap the pattern
            return this.getChild(segment.pattern, params);
        } else if (this._children['*']
        && this._children['*']._paramName === segment.name) {
            // XXX: also compare modifier!
            return this._children['*'] || null;
        }
    }

    hasChildren() {
        return Object.keys(this._children).length || this._children['*'];
    }

    keys() {
        if (this._children['*'] || this._children['**']) {
            return [];
        } else {
            const res = [];
            Object.keys(this._children).forEach((key) => {
                // Only list '' if there are children (for paths like
                // /double//slash)
                if (key !== _keyPrefix || this._children[key].hasChildren()) {
                    res.push(key.replace(_keyPrefixRegExp, ''));
                }
            });
            return res.sort();
        }
    }

    // Shallow clone, allows sharing of subtrees in DAG
    clone() {
        const c = new Node();
        c._children = this._children;
        c._paramName = this._paramName;
        return c;
    }

    // Call promise-returning fn for each node value, with the path to the value
    visitAsync(fn, path) {
        path = path || [];
        // First value, then each of the children (one by one)
        return fn(this.value, path)
        .then(() => P.resolve(Object.keys(this._children))
        .each((childKey) => {
            const segment = childKey.replace(/^\//, '');
            const child = this._children[childKey];
            if (child === this) {
                // Don't enter an infinite loop on **
                return;
            } else {
                return child.visitAsync(fn, path.concat([segment]));
            }
        }));
    }

    toJSON() {
        if (this._children['**'] === this) {
            return {
                value: printableValue(this.value),
                _children: '<recursive>',
                _paramName: this._paramName
            };
        } else {
            return {
                value: printableValue(this.value),
                _children: this._children,
                _paramName: this._paramName
            };
        }
    }
}

module.exports = Node;
