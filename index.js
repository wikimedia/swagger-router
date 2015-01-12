"use strict";

// For Map. Not used in the fast path.
require("es6-shim");


/***
 * :SECTION 1:
 * Private module variables and methods
 ***/

// a global variable holding the ID the next created node should have
var nextNodeId = 0;

function normalizePath (path) {
    if (path.split) {
        // Strip a leading slash & split on remaining slashes
        path = path.replace(/^\//, '').split(/\//);
    } else if(!(Array.isArray(path))) {
        throw new Error("Invalid path: " + path);
    }
    // Re-join {/var} patterns
    for (var i = 0; i < path.length - 1; i++) {
        if (/{$/.test(path[i]) && /}$/.test(path[i+1])) {
            var rest = path[i].replace(/{$/, '');
            if (rest.length) {
                path.splice(i, 2, rest, '{/' + path[i+1]);
            } else {
                path.splice(i, 2, '{/' + path[i+1]);
            }
        }
    }
    return path;
}

function parsePattern (pattern) {
    var bits = normalizePath(pattern);
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


/***
 * :SECTION 2:
 * Module class definitions
 ***/

/*
 * A node in the lookup graph.
 *
 * We use a single monomorphic type for the JIT's benefit.
 */
function Node (info) {
    // Exensible info object. Public read-only property.
    // Typical members:
    // - spec: the original spec object (for doc purposes)
    this.info = info || {};
    // The value for a path ending on this node. Public property.
    this.value = null;

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

// Shallow clone, allows sharing of subtrees in DAG
Node.prototype.clone = function () {
    var c = new Node();
    c._map = this._map;
    c._name = this._name;
    c._wildcard = this._wildcard;
};


/**
 * Represents a URI object which can optionally contain and
 * bind optional variables encountered in the URI string
 *
 * @param {String|URI} uri the URI path or object to create a new URI from
 * @param {Object} params the values for variables encountered in the URI path (optional)
 */
function URI(uri, params) {
    // Public, read-only property.
    this.segments = [];
    if (uri.constructor === URI) {
        uri.segments.forEach(function (item) {
            if (item.constructor === Object) {
                this.segments.push({
                    modifier: item.modifier,
                    name: item.name,
                    pattern: item.pattern
                });
            } else {
                this.segments.push(item);
            }
        }, this);
    } else if (uri.constructor === String || uri.constructor === Array) {
        this.segments = parsePattern(uri);
    }
    this._str = null;
    if (params) {
        this.bind(params);
    }
}

/**
 * Binds the provided parameter values to URI's variable components
 *
 * @param {Object} params the parameters (and their values) to bind
 * @return {URI} this URI object
 */
URI.prototype.bind = function (params) {
    if (!params || params.constructor !== Object) {
        // wrong params format
        return this;
    }
    // look only for parameter keys which match
    // variables in the URI
    this.segments.forEach(function (item) {
        if(item && item.constructor === Object && params[item.name]) {
            item.pattern = params[item.name];
            // we have changed a value, so invalidate the string cache
            this._str = null;
        }
    }, this);
    return this;
};

/**
 * Builds and returns the full, bounded string path for this URI object
 *
 * @return {String} the complete path of this URI object
 */
URI.prototype.toString = function () {
    if (this._str) {
        // there is a cached version of the URI's string
        return this._str;
    }
    this._str = '';
    this.segments.forEach(function (item) {
        if (item.constructor === Object) {
            if (item.pattern) {
                // there is a known value for this variable,
                // so use it
                this._str += '/' + encodeURIComponent(item.pattern);
            } else if (item.modifer) {
                // we are dealing with a modifier, and there
                // seems to be no value, so simply ignore the
                // component
                this._str += '';
            } else {
                // we have a variable component, but no value,
                // so let's just return the variable name
                this._str += '/{' + item.name + '}';
            }
        } else {
            this._str += '/' + item;
        }
    }, this);
    return this._str;
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
    // Map for sharing of sub-trees corresponding to the same specs, using
    // object identity on the spec fragment. Not yet implemented.
    this._nodes = new Map();
}

// XXX modules: variant that builds a prefix tree from segments, but pass in a
// spec instead of a value
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


Router.prototype.specToTree = function (spec) {
    var root = new Node(/*{ spec: spec }*/);
    for (var path in spec.paths) {
        var segments = parsePattern(path);
        this._extend(segments, root, spec.paths[path]);
    }
    return root;
};

// handle one spec path
Router.prototype._handleRESTBasePathSpec = function(node, subspec, symbols) {
    var self = this;
    var xrb = subspec['x-restbase'];
    if (xrb) {
        symbols = symbols || {};
        // modules
        if (Array.isArray(xrb.modules)) {
            // load each module
            xrb.modules.forEach(function(m) {
                // Share modules
                var mObj = self._modules.get(m);
                if (!mObj) {
                    mObj = require(/* somepath + */ m.name)(m.options);
                }
                for (var symbol in mObj) {
                    // check for duplicate symbols
                    if (symbols[symbol]) {
                        throw new Error("Duplicate symbol " + symbol
                                + " in module " + m.name);
                    } else {
                        symbols[symbol] = mObj[symbol];
                    }
                }
            });
        }

        // interfaces
        if (Array.isArray(xrb.interfaces)) {
            xrb.interfaces.forEach(function(subSpec) {
                return self.handleRESTBaseSpec(node, subSpec, symbols);
            });
        }
    }

    for (var methodName in subspec) {
        if (methodName === 'x-restbase') {
            continue;
        }
        // Other methods
        var method = subspec[methodName];
        var mxrb = method['x-restbase'];
        if (mxrb) {
            // check for 'handler' in symbols
            if (mxrb.handler) {
                var handler = symbols[mxrb.handler];
                if (handler) {
                    node.value.methods[methodName] = handler;
                }
            } else if (mxrb.service) {
                // set up a handler
                // XXX: share?
                node.value.methods[methodName] = function (restbase, req) {
                    // XXX: expand the request with req information!
                    restbase.request(mxrb.service);
                };
            }
        }
    }
};

Router.prototype.handleRESTBaseSpec = function (rootNode, spec, modules) {
    var self = this;
    function handlePaths (paths) {
        // handle paths
        for (var pathPattern in paths) {
            var pathSpec = paths[pathPattern];
            var path = parsePattern(pathPattern);
            // Expected to return
            // - rootNode for single-element path
            // - a subnode for longer paths
            var branchNode = self._buildPath(rootNode, path.slice(0, path.length - 1));
            // Check if we can share the path spec
            var subtree = self._nodes.get(pathSpec);
            if (!subtree) {
                // Build a new tree
                subtree = new Node();
                subtree.value = {
                    methods: {}
                };
                // Assign the node before building the tree, so that sharing
                // opportunities with the same spec are discovered while doing so
                self._nodes.set(pathSpec, subtree);
                self._handleRESTBasePathSpec(subtree, pathSpec, modules);
            }
            // XXX: check for conflicts!
            branchNode.set(path[path.length - 1], subtree);
        }
    }

    // TODO: handle global spec settings
    if (spec['x-restbase-paths']) {
        handlePaths(spec['x-restbase-paths']);
        // TODO:
        // - set up path-based ACLs
        // - bail out if prefix is not '/{domain}/sys/'
    }

    if (spec.paths) {
        handlePaths(spec.paths);
    }

};

Router.prototype.restBaseSpecToTree = function(spec) {
    var root = new Node();
    this.handleRESTBaseSpec(root, spec);
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
        var nextNode = node.get(path[i], params);
        if (!nextNode || !nextNode.get) {
            // Found our extension point
            node.set(path[i], this._buildTree(path.slice(i+1), value));
            return;
        } else {
            node = nextNode;
        }
    }
    if (value !== undefined) {
        node.value = value;
    }
};

// Extend an existing route tree with a new path by walking the existing tree
// and inserting new subtrees at the desired location.
Router.prototype._buildPath = function route(node, path) {
    var params = {};
    for (var i = 0; i < path.length; i++) {
        var nextNode = node.get(path[i], params);
        if (!nextNode || !nextNode.get) {
            nextNode = new Node();
            node.set(path[i], nextNode);
            node = nextNode;
        } else {
            node = nextNode;
        }
    }
    return node;
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

module.exports = {
    Router: Router,
    URI: URI,
    Node: Node
};

