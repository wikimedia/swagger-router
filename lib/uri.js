"use strict";

var url = require('url');
var utils = require('./utils');
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
    this.urlObj = null;
    if (uri && uri.constructor === URI) {
        this.urlObj = uri.urlObj;
        // this.path is considered immutable, so can be shared with other URI
        // instances
        this.path = uri.path;
    } else if (uri && (uri.constructor === String || Array.isArray(uri))) {
        if (uri.constructor === String) {
            if (/^[^\/]+:/.test(uri)) {
                this.urlObj = url.parse(uri);
                // Work around encoding difference for {} between node 0.10 &
                // 0.12 / iojs. 0.10 leaves those chars as they are in .path,
                // newer node versions percent-encode them.
                uri = uri.substr(this.urlObj.resolve('/').length - 1);
            }
        }
        this.path = utils.parsePath(uri, asPattern);
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
    var uriStr = this.urlObj && this.urlObj.resolve('/').replace(/\/$/, '')
    || '';
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
 * @param {object} params (optional) Parameters to use for expansion. Uses
 * URI-assigned parameters if not supplied.
 * @return {URI}
 */
URI.prototype.expand = function(params) {
    if (!params) {
        params = this.params;
    }
    var res = new Array(this.path.length);
    for (var i = 0; i < this.path.length; i++) {
        var segment = this.path[i];
        if (segment && segment.constructor === Object) {
            var segmentValue = params[segment.name];
            if (segmentValue === undefined) {
                segmentValue = segment.pattern;
                if (segmentValue === undefined) {
                    if (segment.modifier) {
                        // Okay to end the URI here
                        // Pop over-allocated entries
                        while (res[res.length - 1] === undefined) {
                            res.pop();
                        }
                        return new URI(res);
                    } else {
                        throw new Error('URI.expand: parameter ' + segment.name + ' not defined!');
                    }
                }
            }
            res[i] = segmentValue + ''; // coerce segments to string
        } else {
            res[i] = segment;
        }
    }
    var uri = new URI(res);
    // FIXME: handle this in the constructor!
    uri.urlObj = this.urlObj;
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