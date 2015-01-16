"use strict";

if (!global.Promise || !global.Promise.promisify) {
    global.Promise = require('bluebird');
}

/***
 * :SECTION 1:
 * Private module variables and methods
 ***/


function normalizePath (path) {
    if (path && path.constructor === String) {
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

function parsePattern (pattern) {
    var bits = normalizePath(pattern);
    // Parse pattern and convert it to objects to be consumed by
    // Node.setChild().
    return bits.map(function(bit) {
        // Support named but fixed values as
        // {domain:en.wikipedia.org}
        var m = /^{([+\/])?([a-zA-Z0-9_]+)(?::([^}]+))?}$/.exec(bit);
        if (m) {
            if (m[1]) {
                throw new Error("Modifiers are not yet implemented: " + pattern);
            }
            return {
                modifier: m[1],
                name: m[2],
                pattern: robustDecodeURIComponent(m[3] || '')
            };
        } else {
            return robustDecodeURIComponent(bit);
        }
    });
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
 */
function URI(uri, params) {
    // Public, read-only property.
    this.path = [];
    if (uri && uri.constructor === URI) {
        uri.path.forEach(function (item) {
            if (item.constructor === Object) {
                this.path.push({
                    modifier: item.modifier,
                    name: item.name,
                    pattern: item.pattern
                });
            } else {
                this.path.push(item);
            }
        }, this);
    } else if (uri && (uri.constructor === String || Array.isArray(uri))) {
        this.path = parsePattern(uri);
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
        throw new Error('Expected URI parameter object, got ' + params);
    }
    // look only for parameter keys which match
    // variables in the URI
    this.path.forEach(function (item) {
        if(item && item.constructor === Object && params[item.name]) {
            item.pattern = params[item.name];
            // we have changed a value, so invalidate the string cache
            this._str = null;
        }
    }, this);
    return this;
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

/**
 * Appends the specified suffix to this URI object
 *
 * @param {String|URI} pathOrURI the suffix to append
 * @return {URI} this URI object
 */
URI.prototype.pushSuffix = function (pathOrURI) {
    var suffix;
    if (!pathOrURI) {
        return this;
    }
    if (pathOrURI.constructor === URI) {
        suffix = pathOrURI.path;
    } else {
        suffix = parsePattern(pathOrURI);
    }
    this.path = this.path.concat(suffix);
    this._str = null;
    return this;
};

/**
 * Removes the given suffix from this URI object
 *
 * @param {String|URI} pathOrURI the suffix path to remove
 * @return {URI} this URI object
 */
URI.prototype.popSuffix = function (pathOrURI) {
    var suffix;
    var mySeg = this.path;
    var currSuffixIdx, currMyIdx;
    if (!pathOrURI) {
        return this;
    }
    // get the suffix to remove
    if (pathOrURI.constructor === URI) {
        suffix = pathOrURI.path;
    } else {
        suffix = parsePattern(pathOrURI);
    }
    // check the compatibility of each segment
    currSuffixIdx = suffix.length - 1;
    currMyIdx = mySeg.length - 1;
    while (currMyIdx >= 0 && currSuffixIdx >= 0) {
        var myCurr = mySeg[currMyIdx];
        var suffCurr = suffix[currSuffixIdx];
        var remove = true;
        if (myCurr.constructor !== Object && suffCurr.constructor !== Object) {
            if (myCurr !== suffCurr) {
                remove = false;
            }
        }
        if (!remove) {
            break;
        }
        // ok, pop the segment
        mySeg.pop();
        this._str = null;
        currMyIdx--;
        currSuffixIdx--;
    }
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
    this.path.forEach(function (item) {
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
                this._str += '/{' + encodeURIComponent(item.name) + '}';
            }
        } else {
            this._str += '/' + encodeURIComponent(item);
        }
    }, this);
    return this._str;
};

URI.prototype.toJSON = URI.prototype.toString;


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
    this._children = {};
    this._paramName = null;
}

Node.prototype._keyPrefix = '/';
Node.prototype._keyPrefixRegExp = /^\//;

Node.prototype.setChild = function(key, child) {
    var self = this;
    if (key.constructor === String) {
        this._children[this._keyPrefix + key] = child;
    } else if (key.name && key.pattern && key.pattern.constructor === String) {
        // A named but plain key.
        child._paramName = key.name;
        this._children[this._keyPrefix + key.pattern] = child;
    } else {
        // Setting up a wildcard match
        child._paramName = key.name;
        this._children.wildcard = child;
    }
};

Node.prototype.getChild = function(segment, params) {
    if (segment.constructor === String) {
        // Fast path
        if (segment !== '') {
            var res = this._children[this._keyPrefix + segment]
                // Fall back to the wildcard match
                || this._children.wildcard
                || null;
            if (res && res._paramName) {
                params[res._paramName] = segment;
            }
            return res;
        } else {
            // Don't match the wildcard with an empty segment.
            return this._children[this._keyPrefix + segment];
        }

    // Fall-back cases for internal use during tree construction. These cases
    // are never used for actual routing.
    } else if (segment.pattern) {
        // Unwrap the pattern
        return this.getChild(segment.pattern, params);
    } else if (this._children.wildcard
            && this._children.wildcard._paramName === segment.name) {
        // XXX: also compare modifier!
        return this._children.wildcard || null;
    }
};

Node.prototype.hasChildren = function () {
    return Object.keys(this._children).length || this._children.wildcard;
};

Node.prototype.keys = function () {
    var self = this;
    if (this._children.wildcard) {
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
            return self._children[childKey].visitAsync(fn, path.concat([childKey]));
        });
    });
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
        var subTree = this._buildTree(path.slice(1), value);
        node.setChild(segment, subTree);
    } else {
        node.value = value;
    }
    return node;
};


Router.prototype.specToTree = function (spec) {
    var root = new Node(/*{ spec: spec }*/);
    for (var pathPattern in spec.paths) {
        var path = parsePattern(pathPattern);
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
    if (!path || path.constructor !== URI) {
        path = normalizePath(path);
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

