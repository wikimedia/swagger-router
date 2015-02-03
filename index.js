"use strict";

if (!global.Promise || !global.Promise.promisify) {
    global.Promise = require('bluebird');
}

/***
 * :SECTION 1:
 * Private module variables and methods
 ***/



function robustDecodeURIComponent(uri) {
    if (!/%/.test(uri)) {
        return uri;
    } else {
        return uri.replace(/(%[0-9a-fA-F][0-9a-fA-F])+/g, function(m) {
            try {
                return decodeURIComponent( m );
            } catch ( e ) {
                return m;
            }
        });
    }
}

//               / (   {pattern} or {+pattern}                      )|( {/pattern}
var splitRe = /(\/)(?:\{([\+])?([^:\}\/]+)(?::([^}]+))?\}|([^\/\{]*))|(?:{([\/\+]))([^:\}\/]+)(?::([^}]+))?\}/g;
function parsePattern (pattern, isPattern) {
    if (Array.isArray(pattern)) {
        return pattern;
    } else if (!isPattern) {
        return pattern.replace(/^\//, '').split(/\//).map(function(bit) {
            return robustDecodeURIComponent(bit);
        });
    } else {
        var res = [];
        splitRe.lastIndex = 0;
        var m;
        do {
            m = splitRe.exec(pattern);
            if (m) {
                if (m[1] === '/') {
                    if (m[5] !== undefined) {
                        // plain path segment
                        res.push(robustDecodeURIComponent(m[5]));
                    } else if (m[3]) {
                        // templated path segment
                        res.push({
                            name: m[3],
                            modifier: m[2],
                            pattern: m[4]
                        });
                    }
                } else if (m[7]) {
                    // Optional path segment:
                    // - {/foo} or {/foo:bar}
                    // - {+foo}
                    res.push({
                        name: m[7],
                        modifier: m[6],
                        pattern: m[8]
                    });
                } else {
                    throw new Error('The impossible happened!');
                }
            }
        } while (m);
        return res;
    }
}


/***
 * :SECTION 2:
 * Module class definitions
 ***/

/**
 * Represents a URI object which can optionally contain and
 * bind optional variables encountered in the URI string
 *
 * @param {String|URI} uri the URI path or object to create a new URI from
 * @param {Object} params the values for variables encountered in the URI path (optional)
 * @param {boolean} asPattern Whether to parse the URI as a pattern (optional)
 * @return {URI} URI object. Public properties:
 *  - `params` {object} mutable. Parameter object.
 *  - `path` {array} immutable.
 */
function URI(uri, params, asPattern) {
    this.params = params || {};
    if (uri && uri.constructor === URI) {
        // this.path is considered immutable, so can be shared with other URI
        // instances
        this.path = uri.path;
    } else if (uri && (uri.constructor === String || Array.isArray(uri))) {
        this.path = parsePattern(uri, asPattern);
    } else if (uri !== '') {
        throw new Error('Invalid path passed into URI constructor: ' + uri);
    }
}

/**
 * Builds and returns the full, bounded string path for this URI object
 *
 * @return {String} the complete path of this URI object
 * @param {string} format Either 'simplePattern' or 'fullPattern'. [optional]
 * @return {string} URI path
 */
URI.prototype.toString = function (format) {
    var uriStr = '';
    for (var i = 0; i < this.path.length; i++) {
        var segment = this.path[i];
        if (segment && segment.constructor === Object) {
            var segmentValue = this.params[segment.name];
            if (segmentValue === undefined) {
                segmentValue = segment.pattern;
            }

            if (segmentValue !== undefined) {
                if (!format || format === 'simplePattern' || !segment.name) {
                    // Normal mode
                    uriStr += '/' + encodeURIComponent(segmentValue);
                } else {
                    uriStr += '/{' + (segment.modifier || '')
                        + encodeURIComponent(segment.name) + ':'
                        + encodeURIComponent(segmentValue) + '}';
                }
            } else if (format && !segment.modifier) {
                uriStr += '/{' + encodeURIComponent(segment.name) + '}';
            } else if (format) {
                uriStr += '{' + (segment.modifier || '')
                    + encodeURIComponent(segment.name)
                    + '}';
            } else {
                if (segment.modifier === '+') {
                    // Add trailing slash
                    uriStr += '/';
                }
                // Omit optional segment & return
                return uriStr;
            }
        } else {
            uriStr += '/' + encodeURIComponent(segment);
        }
    }
    return uriStr;
};


/**
 * Expand all parameters in the URI and return a new URI.
 * @return {URI}
 */
URI.prototype.expand = function() {
    var res = [];
    for (var i = 0; i < this.path.length; i++) {
        var segment = this.path[i];
        if (segment && segment.constructor === Object) {
            var segmentValue = this.params[segment.name];
            if (segmentValue === undefined) {
                segmentValue = segment.pattern;
            }
            if (segmentValue === undefined) {
                if (segment.modifier) {
                    // Okay to end the URI here
                    return new URI(res);
                } else {
                    throw new Error('URI.expand: parameter ' + segment.name + ' not defined!');
                }
            }
            res[i] = segmentValue;
        } else {
            res[i] = segment;
        }
    }
    return new URI(res);
};

/**
 * Checks if the URI starts with the given path prefix
 *
 * @param {String|URI} pathOrURI the prefix path to check for
 * @return {Boolean} whether this URI starts with the given prefix path
 */
URI.prototype.startsWith = function (pathOrURI) {
    var uri;
    if (!pathOrURI) {
        return true;
    }
    if (pathOrURI.constructor === URI) {
        uri = pathOrURI;
    } else {
        uri = new URI(pathOrURI);
    }
    // if our URI is shorter than the one we are
    // comparing to, it doesn't start with that prefix
    if (this.path.length < uri.path.length) {
        return false;
    }
    // check each component
    for (var idx = 0; idx < uri.path.length; idx++) {
        var mySeg = this.path[idx];
        var otherSeg = uri.path[idx];
        if (mySeg.constructor === Object && otherSeg.constructor === Object) {
            // both path are named variables
            // nothing to do
            continue;
        } else if (mySeg.constructor === Object) {
            // we have a named variable, but there is a string
            // given in the prefix
            if (mySeg.pattern && mySeg.pattern !== otherSeg) {
                // they differ
                return false;
            }
        } else if (otherSeg.constructor === Object) {
            // we have a fixed string, but a variable has been
            // given in the prefix - nothing to do
            continue;
        } else if (mySeg !== otherSeg) {
            // both are strings, but they differ
            return false;
        }
    }
    // ok, no differences found
    return true;
};

// For JSON.stringify
URI.prototype.toJSON = URI.prototype.toString;
// For util.inspect, console.log & co
URI.prototype.inspect = function () {
    // Quote the string
    return JSON.stringify(this.toString());
};


/*
 * A node in the lookup graph.
 *
 * We use a single monomorphic type for the JIT's benefit.
 */
function Node (value) {
    // The value for a path ending on this node. Public property.
    this.value = value || null;

    // Internal properties.
    this._children = {};
    this._paramName = null;
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
        if (segment !== '') {
            var res = this._children[this._keyPrefix + segment]
                // Fall back to the wildcard match
                || this._children['*']
                || this._children['**']
                || null;
            if (res && res._paramName) {
                if (this._children['**'] === res) {
                    // Build up an array for ** matches ({+foo})
                    if (!Array.isArray(params[res._paramName])) {
                        params[res._paramName] = [segment];
                    } else {
                        params[res._paramName].push(segment);
                    }
                } else {
                    params[res._paramName] = segment;
                }
            }
            return res;
        } else {
            // Don't match the wildcards with an empty segment.
            return this._children[this._keyPrefix + segment];
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

Node.prototype.hasChildren = function () {
    return Object.keys(this._children).length || this._children['*'];
};

Node.prototype.keys = function () {
    var self = this;
    if (this._children['*']) {
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
Node.prototype.clone = function () {
    var c = new Node();
    c._children = this._children;
    return c;
};


// Call promise-returning fn for each node value, with the path to the value
Node.prototype.visitAsync = function(fn, path) {
    path = path || [];
    var self = this;
    // First value, then each of the children (one by one)
    return fn(self.value, path)
    .then(function() {
        return Promise.resolve(Object.keys(self._children))
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
function printableValue (value) {
    var res = {};
    if (!value || ! (value instanceof Object)) {
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
        } else {
            res[key] = val;
        }
    });
    return res;
}

Node.prototype.toJSON = function () {
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


/*
 * The main router object
 */
function Router (options) {
    // Options:
    // - specHandler(spec) -> spec'
    // - pathHandler(pathSpec) -> pathSpec'
    this._options = options || {};
    this._root = new Node();
}

// XXX modules: variant that builds a prefix tree from a path array, but pass
// in a spec instead of a value
Router.prototype._buildTree = function(path, value) {
    var node = new Node();
    if (path.length) {
        var segment = path[0];
        if (segment.modifier === '+') {
            // Set up a recursive match and end the traversal
            var recursionNode = new Node();
            recursionNode.value = value;
            recursionNode.setChild(segment, recursionNode);
            node.setChild(segment, recursionNode);
        } else {
            var subTree = this._buildTree(path.slice(1), value);
            node.setChild(segment, subTree);
            if (segment.modifier === '/') {
                // Set the value for each optional path segment ({/foo})
                node.value = value;
                subTree.value = value;
            }
        }
    } else {
        node.value = value;
    }
    return node;
};


Router.prototype.specToTree = function (spec) {
    var root = new Node();
    for (var pathPattern in spec.paths) {
        var path = parsePattern(pathPattern, true);
        this._extend(path, root, spec.paths[pathPattern]);
    }
    return root;
};

Router.prototype.setTree = function(tree) {
    this._root = tree;
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
    for (var i = 0; i < path.length; i++) {
        var nextNode = node.getChild(path[i], params);
        if (!nextNode || !nextNode.getChild) {
            // Found our extension point
            node.setChild(path[i], this._buildTree(path.slice(i+1), value));
            //if (path[path.length - 1].modifier === '+') {
            //    console.log(JSON.stringify(node, null, 2));
            //}
            return;
        } else {
            node = nextNode;
        }
    }
    if (value !== undefined) {
        node.value = value;
    }
};

// Lookup worker.
Router.prototype._lookup = function route(path, node) {
    var params = {};
    var prevNode;
    for (var i = 0; i < path.length; i++) {
        if (!node || !node.getChild) {
            return null;
        }
        prevNode = node;
        node = node.getChild(path[i], params);
    }
    if (node || prevNode && path[path.length - 1] === '') {
        if (path[path.length - 1] === '') {
            // Pass in a listing
            params._ls = prevNode.keys();
        }
        return {
            params: params,
            value: (node && node.value || null)
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
    if (!path) {
        throw new Error('Path expected!');
    } else if (path.constructor === String) {
        path = parsePattern(path);
    } else if (path.constructor === URI) {
        path = path.path;
    }
    var res = this._lookup(path, this._root);
    if (res) {
        return {
            params: res.params,
            value: res.value
        };
    } else {
        return res;
    }
};

module.exports = {
    Router: Router,
    URI: URI,
    Node: Node
};

