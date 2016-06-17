"use strict";

var utils = require('./utils');
/**
 * Represents a URI object which can optionally contain and
 * bind optional variables encountered in the URI string
 *
 * @param {String|URI|Array} uri the URI path or object to create a new URI from
 * @param {Object} params the values for variables encountered in the URI path (optional)
 * @param {boolean} asPattern Whether to parse the URI as a pattern (optional)
 * @return {URI} URI object. Public properties:
 *  - `params` {object} mutable. Parameter object.
 *  - `path` {array} immutable.
 */
function URI(uri, params, asPattern) {
    // Initialise all fields to make an object monomorphic
    this.params = params || {};
    this.protoHost = null;
    this.path = null;
    this._pathMetadata = {};

    if (typeof uri === 'string') {
        var protoHostMatch = /^[^\/]+:(?:\/\/)?[^\/]+/.exec(uri);
        if (protoHostMatch) {
            this.protoHost = protoHostMatch[0];
            uri = uri.substring(this.protoHost.length);
        }
        this.path = utils.parsePath(uri, asPattern);
    } else if (Array.isArray(uri)) {
        if (!asPattern) {
            // Ensure that all path segments are strings
            for (var i = 0; i < uri.length; i++) {
                uri[i] = '' + uri[i];
            }
        }
        this.path = uri;
    } else if (uri && uri.constructor === URI) {
        this.protoHost = uri.protoHost;
        // this.path is considered immutable, so can be shared with other URI
        // instances
        this.path = uri.path;
    } else if (uri !== '') {
        throw new Error('Invalid path passed into URI constructor: ' + uri);
    }
}

/**
 * Builds and returns the full, bounded string path for this URI object
 *
 * @return {String} the complete path of this URI object
 * @param {object} options {
 *      format {string} Either 'simplePattern' or 'fullPattern'. [optional]
 *      params {object} parameters to use during serialization
 * }
 * @return {string} URI path
 */
URI.prototype.toString = function(options) {
    // b/c
    if (!options || options.constructor === String) {
        options = { format: options };
    }
    var params = options.params || this.params;
    var uriStr = this.protoHost || '';
    for (var i = 0; i < this.path.length; i++) {
        var segment = this.path[i];
        if (segment && segment.constructor === Object) {
            var segmentValue = params[segment.name];
            if (segmentValue === undefined) {
                segmentValue = segment.pattern;
            }

            if (segmentValue !== undefined) {
                if (!options.format || options.format === 'simplePattern' || !segment.name) {
                    if (segment.modifier === '+') {
                        uriStr += '/' + segmentValue;
                    } else {
                        // Normal mode
                        uriStr += '/' + encodeURIComponent(segmentValue);
                    }
                } else {
                    uriStr += '/{' + (segment.modifier || '')
                        + encodeURIComponent(segment.name) + ':'
                        + encodeURIComponent(segmentValue) + '}';
                }
            } else if (options.format && !segment.modifier) {
                uriStr += '/{' + encodeURIComponent(segment.name) + '}';
            } else if (options.format) {
                uriStr += '{' + (segment.modifier || '')
                    + encodeURIComponent(segment.name) + '}';
            } else {
                if (segment.modifier === '+') {
                    // Add trailing slash
                    uriStr += '/';
                }
                // Omit optional segment & return
                return uriStr;
            }
        } else if (this._pathMetadata
                && this._pathMetadata[i]
                && this._pathMetadata[i] === '+') {
            uriStr += '/' + utils.encodeReserved(segment);
        } else {
            uriStr += '/' + encodeURIComponent(segment);
        }
    }
    return uriStr;
};


/**
 * Expand all parameters in the URI and return a new URI.
 * @param {object} params (optional) Parameters to use for expansion. Uses
 * URI-assigned parameters if not supplied.
 * @return {URI}
 */
URI.prototype.expand = function(params) {
    if (!params) {
        params = this.params;
    }
    var res = [];
    var pathMetadata = {};
    var uri;
    for (var i = 0; i < this.path.length; i++) {
        var segment = this.path[i];
        if (segment && segment.constructor === Object) {
            var segmentValue = params[segment.name];
            if (segmentValue === undefined) {
                segmentValue = segment.pattern;
                if (segmentValue === undefined) {
                    if (segment.modifier) {
                        // Skip over this optional segment.
                        continue;
                    } else {
                        segmentValue = '';
                    }
                }
            }

            if (segment.modifier === '+') {
                // Res will become a path array, so we must split path elements
                var oldResLen = res.length;
                res = res.concat(('' + segmentValue).split('/'));
                // Set up metadata for all path elements under {+} template
                for (var j = oldResLen; j < res.length; j++) {
                    pathMetadata[j] = '+';
                }
            } else {
                res.push('' + segmentValue);
            }
        } else {
            res.push(segment);
        }
    }

    uri = new URI(res);
    uri.protoHost = this.protoHost;
    // FIXME: handle this in the constructor!
    uri._pathMetadata = pathMetadata;
    return uri;
};

/**
 * Checks if the URI starts with the given path prefix
 *
 * @param {String|URI} pathOrURI the prefix path to check for
 * @return {Boolean} whether this URI starts with the given prefix path
 */
URI.prototype.startsWith = function(pathOrURI) {
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
URI.prototype.inspect = function() {
    // Quote the string
    return JSON.stringify(this.toString());
};

module.exports = URI;
