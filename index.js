"use strict";

// For Map. Not used in the fast path.
require("es6-shim");

// a global variable holding the ID the next created node should have
var nextNodeId = 0;

/*
 * A node in the lookup graph.
 *
 * We use a single monomorphic type for the JIT's benefit.
 */
function Node () {
    // The value for a path ending on this node. Public property.
    this.value = null;
    // this node's ID
    this.id = nextNodeId++;
    
    // Internal properties.
    this._map = {};
    this._name = null;
    this._wildcard = null;
}

Node.prototype.set = function(key, value) {
    if (key.constructor === String) {
        this._map['k' + key] = value;
    } else if (key.name && key.pattern && key.pattern.constructor === String) {
        // A named but plain key. Check if the name matches & set it normally.
        if (this._name && this._name !== key.name) {
            throw new Error("Captured pattern parameter " + key.name
                    + " does not match existing name " + this._name);
        }
        this._name = key.name;
        this._map['k' + key.pattern] = value;
    } else {
        // Setting up a wildcard match
        // Check if there are already other non-empty keys
        var longKeys = Object.keys(this._map).filter(function(key) {
            return key.length > 1;
        });
        if (longKeys.length) {
            throw new Error("Can't register \"" + key + "\" in a wildcard path segment!");
        } else {
            this._name = key.name;
            // Could handle a modifier or regexp here as well
            this._wildcard = value;
        }
    }
};

Node.prototype.get = function(segment, params) {
    if (segment.constructor === String) {
        // Fast path
        if (segment !== '') {
            var res = this._map['k' + segment] || this._wildcard;
            if (this._name && res) {
                params[this._name] = segment;
            }
            return res;
        } else {
            // Don't match the wildcard with an empty segment.
            return this._map['k' + segment];
        }

    // Fall-back cases for internal use during tree construction. These cases
    // are never used for actual routing.
    } else if (segment.pattern) {
        // Unwrap the pattern
        return this.get(segment.pattern, params);
    } else if (segment.name === this._name) {
        // XXX: also compare modifier!
        return this._wildcard;
    }
};

Node.prototype.hasChildren = function () {
    return Object.keys(this._map).length || this._wildcard;
};

Node.prototype.keys = function () {
    var self = this;
    if (this._wildcard) {
        return [];
    } else {
        var res = [];
        Object.keys(this._map).forEach(function(key) {
            // Only list '' if there are children (for paths like
            // /double//slash)
            if (key !== 'k' || self._map[key].hasChildren()) {
                res.push(key.replace(/^k/, ''));
            }
        });
        return res.sort();
    }
};


/*
 * The main router object
 */
function Router () {
    this._root = new Node();
    // Map for sharing of sub-trees corresponding to the same specs, using
    // object identity on the spec fragment. Not yet implemented.
    this._nodes = new Map();
}

function normalizePath (path) {
    if (Array.isArray(path)) {
        // Nothing to be done
        return path;
    } else if (path.split) {
        return path.replace(/^\//, '').split(/\//);
    } else {
        throw new Error("Invalid path: " + path);
    }
}

function parsePattern (pattern) {
    var bits = normalizePath(pattern);
    // Re-join {/var} patterns
    for (var i = 0; i < bits.length - 1; i++) {
        if (bits[i] === '{' && /}$/.test(bits[i+1])) {
            bits.splice(i, 2, '{/' + bits[i+1]);
        }
    }
    // Parse pattern segments and convert them to objects to be consumed by
    // Node.set().
    return bits.map(function(bit) {
        // Support named but fixed values as
        // {domain:en.wikipedia.org}
        var m = /^{([+\/])?([a-zA-Z0-9_]+)(?::([^}]+))?}$/.exec(bit);
        if (m) {
            if (m[1]) {
                throw new Error("Modifiers are not yet implemented!");
            }
            return {
                modifier: m[1],
                name: m[2],
                pattern: m[3]
            };
        } else {
            return bit;
        }
    });
}

Router.prototype._buildTree = function(segments, value) {
    var node = new Node();
    if (segments.length) {
        var segment = segments[0];
        var subTree = this._buildTree(segments.slice(1), value);
        node.set(segment, subTree);
    } else {
        node.value = value;
    }
    return node;
};

Router.prototype.addSpec = function addSpec(spec, prefix) {
    var self = this;
    if (!spec || !spec.paths) {
        throw new Error("No spec or no paths defined in spec!");
    }
    // Get the prefix
    prefix = parsePattern(prefix || []);

    for (var path in spec.paths) {
        // Skip over the empty first element
        var segments = parsePattern(path);
        self._extend(prefix.concat(segments), self._root, spec.paths[path]);
    }
};

Router.prototype.delSpec = function delSpec(spec, prefix) {
    // Possible implementation:
    // - Perform a *recursive* lookup for each leaf node.
    // - Walk up the tree and remove nodes as long as `.hasChildren()` is
    //   false.
    // This will work okay in a tree, but would clash with subtree sharing in
    // a graph. We should perform some benchmarks to see if subtree sharing is
    // worth it. Until then we probably don't need spec deletion anyway, as we
    // can always re-build the entire router from scratch.
    throw new Error("Not implemented");
};

// Extend an existing route tree with a new path by walking the existing tree
// and inserting new subtrees at the desired location.
Router.prototype._extend = function route(path, node, value) {
    var params = {};
    var origNode = node;
    for (var i = 0; i < path.length; i++) {
        var nextNode = node.get(path[i], params);
        if (!nextNode || !nextNode.get) {
            // Found our extension point
            node.set(path[i], this._buildTree(path.slice(i+1), value));
            return;
        } else {
            node = nextNode;
        }
    }
    node.value = value;
};

// Lookup worker.
Router.prototype._lookup = function route(path, node) {
    var params = {};
    var prevNode;
    for (var i = 0; i < path.length; i++) {
        if (!node || !node.get) {
            return null;
        }
        prevNode = node;
        node = node.get(path[i], params);
    }
    if (node && node.value) {
        if (path[path.length - 1] === '') {
            // Pass in a listing
            params._ls = prevNode.keys();
        }
        return {
            params: params,
            value: node.value
        };
    } else {
        return null;
    }
};

/*
 * Look up a path in the router, and return either null or the configured
 * object.
 *
 * @param {string|array} path
 * @return {null|object} with object being
 *  {
 *    params: {
 *      someParam: 'pathcomponent'
 *    },
 *    value: theValue
 *  }
 */
Router.prototype.lookup = function route(path) {
    path = normalizePath(path);
    return this._lookup(path, this._root);
};

/**
 * Reports the number of nodes created by the router. Note that
 * this is the total number of created nodes; if some are deleted,
 * this number is not decreased.
 * 
 * @return {Number} the total number of created nodes
 */
Router.prototype.noNodes = function () {
    return nextNodeId;
};

module.exports = Router;
