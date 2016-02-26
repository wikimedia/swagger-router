"use strict";

var URI = require('./uri');
var Node = require('./node');
var utils = require('./utils');
/*
 * The main router object
 */
function Router(options) {
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


Router.prototype.specToTree = function(spec) {
    var root = new Node();
    var self = this;
    Object.keys(spec.paths).forEach(function(pathPattern) {
        var path = utils.parsePath(pathPattern, true);
        self._extend(path, root, spec.paths[pathPattern]);
    });
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
            node.setChild(path[i], this._buildTree(path.slice(i + 1), value));
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
    var permissions = [];
    var filters = [];
    for (var i = 0; i < path.length; i++) {
        if (!node || !node.getChild) {
            return null;
        }
        prevNode = node;
        if (node.value) {
            if (node.value.security) {
                permissions = permissions.concat(node.value.security);
            }
            if (node.value.filters) {
                filters = filters.concat(node.value.filters);
            }
        }
        node = node.getChild(path[i], params);
    }

    if (node && node.value) {
        if (node.value.security) {
            permissions = permissions.concat(node.value.security);
        }
        if (node.value.filters) {
            filters = filters.concat(node.value.filters);
        }
    }

    if (node || prevNode && path[path.length - 1] === '') {
        if (path[path.length - 1] === '') {
            // Pass in a listing
            params._ls = prevNode.keys();
        }
        return {
            params: params,
            value: (node && node.value || null),
            permissions: permissions,
            filters: filters
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
 *    value: theValue,
 *    permissions: [somePermission]
 *  }
 */
Router.prototype.lookup = function route(path) {
    if (!path) {
        throw new Error('Path expected!');
    } else if (path.constructor === String) {
        path = utils.parsePath(path);
    } else if (path.constructor === URI) {
        path = path.path;
    }
    var res = this._lookup(path, this._root);
    if (res) {
        return {
            params: res.params,
            value: res.value,
            permissions: res.permissions,
            filters: res.filters
        };
    } else {
        return res;
    }
};

module.exports = Router;