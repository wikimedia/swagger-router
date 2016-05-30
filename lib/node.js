"use strict";

var P = require('bluebird');

/*
 * A node in the lookup graph.
 *
 * We use a single monomorphic type for the JIT's benefit.
 */
function Node(value) {
    // The value for a path ending on this node. Public property.
    this.value = value || null;

    // Internal properties.
    this._children = {};
    this._paramName = null;
    this._parent = null;
}

Node.prototype._keyPrefix = '/';
Node.prototype._keyPrefixRegExp = /^\//;

Node.prototype.setChild = function(key, child) {
    var self = this;
    if (key.constructor === String) {
        this._children[this._keyPrefix + key] = child;
    } else if (key.name && key.pattern
            && key.modifier !== '+'
            && key.pattern.constructor === String) {
        // A named but plain key.
        child._paramName = key.name;
        this._children[this._keyPrefix + key.pattern] = child;
    } else if (key.modifier === '+') {
        child._paramName = key.name;
        this._children['**'] = child;
    } else {
        // Setting up a wildcard match
        child._paramName = key.name;
        this._children['*'] = child;
    }
};

Node.prototype.getChild = function(segment, params) {
    if (segment.constructor === String) {
        // Fast path
        var res = this._children[this._keyPrefix + segment];
        if (!res) {
            if (segment !== '') {
                // Fall back to the wildcard match, but only if the segment is
                // non-empty.
                res = this._children['*'];
                if (!res && this._children['**']) {
                    res = this._children['**'];
                    // Build up an array for ** matches ({+foo})
                    if (params[res._paramName]) {
                        params[res._paramName] += '/' + encodeURIComponent(segment);
                    } else {
                        params[res._paramName] = encodeURIComponent(segment);
                    }
                    // We are done.
                    return res;
                }
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
};

Node.prototype.hasChildren = function() {
    return Object.keys(this._children).length || this._children['*'];
};

Node.prototype.keys = function() {
    var self = this;
    if (this._children['*'] || this._children['**']) {
        return [];
    } else {
        var res = [];
        Object.keys(this._children).forEach(function(key) {
            // Only list '' if there are children (for paths like
            // /double//slash)
            if (key !== self._keyPrefix || self._children[key].hasChildren()) {
                res.push(key.replace(self._keyPrefixRegExp, ''));
            }
        });
        return res.sort();
    }
};

// Shallow clone, allows sharing of subtrees in DAG
Node.prototype.clone = function() {
    var c = new Node();
    c._children = this._children;
    c._paramName = this._paramName;
    return c;
};


// Call promise-returning fn for each node value, with the path to the value
Node.prototype.visitAsync = function(fn, path) {
    path = path || [];
    var self = this;
    // First value, then each of the children (one by one)
    return fn(self.value, path)
    .then(function() {
        return P.resolve(Object.keys(self._children))
        .each(function(childKey) {
            var segment = childKey.replace(/^\//, '');
            var child = self._children[childKey];
            if (child === self) {
                // Don't enter an infinite loop on **
                return;
            } else {
                return child.visitAsync(fn, path.concat([segment]));
            }
        });
    });
};

// Work around recursive structure in ** terminal nodes
function printableValue(value) {
    var res = {};
    if (!value || !(value instanceof Object)) {
        return value;
    }
    Object.keys(value).forEach(function(key) {
        var val = value[key];
        if (key === 'methods') {
            var newMethods = {};
            Object.keys(val).forEach(function(method) {
                newMethods[method] = '<' + val[method].name + '>';
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

Node.prototype.toJSON = function() {
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
};


module.exports = Node;
