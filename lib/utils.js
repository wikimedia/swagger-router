"use strict";

const utils = {};

function robustDecodeURIComponent(uri) {
    if (!/%/.test(uri)) {
        return uri;
    }
    try {
        return decodeURIComponent(uri);
    } catch (e) {
        return uri.replace(/(%[0-9a-fA-F][0-9a-fA-F])+/g, (m) => {
            try {
                return decodeURIComponent(m);
            } catch (error) {
                return m;
            }
        });
    }
}

// ({pattern} or {+pattern})|({/pattern})
// jscs:disable
/* eslint-disable max-len */
const splitRe = /(\/)(?:\{([\+])?([^:\}\/]+)(?::([^}]+))?\}|([^\/\{]*))|(?:{([\/\+]))([^:\}\/]+)(?::([^}]+))?\}/g;
/* eslint-enable max-len */
// jscs:enable
function parsePattern(pattern) {
    const res = [];
    splitRe.lastIndex = 0;
    let m;
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
utils.parsePath = (path, isPattern) => {
    if (Array.isArray(path)) {
        return path;
    } else if (!isPattern) {
        if (path.charCodeAt(0) === 47 /* "/" */) {
            path = path.substring(1);
        }
        const bits = path.split('/');
        if (/%/.test(path)) {
            for (let i = 0; i < bits.length; i++) {
                if (/%/.test(bits[i])) {
                    bits[i] = robustDecodeURIComponent(bits[i]);
                }
            }
        }
        return bits;
    } else {
        return parsePattern(path);
    }
};

const unescapes = {
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
utils.encodeReserved = (string) => {
    const res = encodeURI(string);
    if (!/[\[\]%]/.test(string)) {
        return res;
    } else {
        // Un-escape [ and ] (which are legal in RFC6570), and un-do
        // double percent escapes.
        return res.replace(/%5B|%5D|%25/gi, (m) => unescapes[m]);
    }
};

utils.toRFC822Date = (date) => {
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
        'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

    function numpad(x, digits) {
        let result = Math.floor(x).toString();
        while (result.length < digits) {
            result = `0${result}`;
        }
        return result;
    }
    return `${days[date.getUTCDay()]}, ${numpad(date.getUTCDate(), 2)} `
        + `${months[date.getUTCMonth()]} ${date.getUTCFullYear()} ${numpad(date.getUTCHours(), 2)}`
        + `:${numpad(date.getUTCMinutes(), 2)}:${numpad(date.getUTCSeconds(), 2)} +0000`;
};

module.exports = utils;
