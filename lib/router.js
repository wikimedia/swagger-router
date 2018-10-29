"use strict";

const URI = require('./uri');
const Node = require('./node');
const utils = require('./utils');

/*
 * The main router object
 */
class Router {
    constructor(options) {
        // Options:
        // - specHandler(spec) -> spec'
        // - pathHandler(pathSpec) -> pathSpec'
        this._options = options || {};
        this._root = new Node();
    }

    // XXX modules: variant that builds a prefix tree from a path array, but pass
    // in a spec instead of a value
    _buildTree(path, value) {
        const node = new Node();
        if (path.length) {
            const segment = path[0];
            if (segment.modifier === '+') {
                // Set up a recursive match and end the traversal
                const recursionNode = new Node();
                recursionNode.value = value;
                recursionNode.setChild(segment, recursionNode);
                node.setChild(segment, recursionNode);
            } else {
                const subTree = this._buildTree(path.slice(1), value);
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
    }

    specToTree(spec) {
        const root = new Node();
        Object.keys(spec.paths).forEach((pathPattern) => {
            const path = utils.parsePath(pathPattern, true);
            this._extend(path, root, spec.paths[pathPattern]);
        });
        return root;
    }

    setTree(tree) {
        this._root = tree;
    }

    addSpec(spec) {
        const tree = this.specToTree(spec);
        this.setTree(tree);
    }

    delSpec() {
        // Possible implementation:
        // - Perform a *recursive* lookup for each leaf node.
        // - Walk up the tree and remove nodes as long as `.hasChildren()` is
        //   false.
        // This will work okay in a tree, but would clash with subtree sharing in
        // a graph. We should perform some benchmarks to see if subtree sharing is
        // worth it. Until then we probably don't need spec deletion anyway, as we
        // can always re-build the entire router from scratch.
        throw new Error("Not implemented");
    }

    // Extend an existing route tree with a new path by walking the existing tree
    // and inserting new subtrees at the desired location.
    _extend(path, node, value) {
        const params = {};
        for (let i = 0; i < path.length; i++) {
            const nextNode = node.getChild(path[i], params, true);
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
    }

    // Lookup worker.
    _lookup(path, node) {
        const params = {};
        let prevNode;
        let permissions = [];
        let filters = [];
        for (let i = 0; i < path.length; i++) {
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
                params._ls = prevNode.keys().filter(key => !/^meta_/.test(key));
            }
            return {
                params,
                value: (node && node.value || null),
                permissions,
                filters
            };
        } else {
            return null;
        }
    }

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
    lookup(path) {
        if (!path) {
            throw new Error('Path expected!');
        } else if (path.constructor === String) {
            path = utils.parsePath(path);
        } else if (path.constructor === URI) {
            path = path.path;
        }
        const res = this._lookup(path, this._root);
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
    }
}

module.exports = Router;
