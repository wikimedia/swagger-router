"use strict";

var utils = {};

function robustDecodeURIComponent(uri) {
    if (!/%/.test(uri)) {
        return uri;
    } else {
        return uri.replace(/(%[0-9a-fA-F][0-9a-fA-F])+/g, function(m) {
            try {
                return decodeURIComponent(m);
            } catch (e) {
                return m;
            }
        });
    }
}

// ({pattern} or {+pattern})|({/pattern})
// jscs:disable
var splitRe = /(\/)(?:\{([\+])?([^:\}\/]+)(?::([^}]+))?\}|([^\/\{]*))|(?:{([\/\+]))([^:\}\/]+)(?::([^}]+))?\}/g;
// jscs:enable
function parsePattern(pattern) {
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

// Parse a path or pattern
utils.parsePath = function(path, isPattern) {
    if (Array.isArray(path)) {
        return path;
    } else if (!isPattern) {
        var bits = path.replace(/^\//, '').split(/\//);
        if (!/%/.test(path)) {
            // fast path
            return bits;
        } else {
            return bits.map(function(bit) {
                return robustDecodeURIComponent(bit);
            });
        }
    } else {
        return parsePattern(path);
    }
};

var unescapes = {
    '%5B': '[',
    '%5D': ']',
    '%25': '%',
};

/**
 * RFC6570 compliant encoder for `reserved` expansion - encodes a URI component
 * while preserving reserved & unreserved characters
 * (http://tools.ietf.org/html/rfc3986#section-2.2) and pct-encoded triplets
 *
 * @param string - a string to encode
 * @return {String} an encoded string
 */
utils.encodeReserved = function(string) {
    var res = encodeURI(string);
    if (!/[\[\]%]/.test(string)) {
        return res;
    } else {
        // Un-escape [ and ] (which are legal in RFC6570), and un-do
        // double percent escapes.
        return res.replace(/%5B|%5D|%25/gi, function(m) {
            return unescapes[m];
        });
    }
};

module.exports = utils;
