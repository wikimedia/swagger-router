"use strict";

require('core-js/shim');
var URI = require('./uri');
var url = require('url');
var TAssembly = require('tassembly');
var expressionCompiler = require('template-expression-compiler');
var utils = require('./utils');

var compilerOptions = {
    ctxMap: {
        $: 'rm',
        $$: 'rc.g',
        globals: 'rm',
        // `global` is deprecated, as `globals` (plural) is more consistent
        // with `options` & the code.
        // TODO: Remove!
        global: 'rm',
    },
    dottedPathPrefix: 'rm',
    callPrefix: 'rc.g',
    modelPrefix: 'm',
};

function compileExpression(expression, part) {
    // Convert the expression to a single line & remove whitespace.
    expression = expression.replace(/\n/g, ' ').trim();
    compilerOptions.modelPrefix = (part && 'rm.request.' + part) || 'm';
    return expressionCompiler.parse(expression, compilerOptions);
}

var globalMethods = {
    default: function(val, defVal) {
        return val || defVal;
    },
    merge: function(destination, source) {
        destination = destination || {};
        source = source || {};

        if (typeof destination !== 'object' || typeof source !== 'object') {
            throw new Error('Illegal argument. ' +
                'Merge source and destination must be objects');
        }

        var result = Object.assign({}, destination);
        Object.keys(source).forEach(function(keyName) {
            if (result[keyName] === undefined) {
                result[keyName] = source[keyName];
            }
        });
        return result;
    },
    strip: function(object, properties) {
        if (typeof object !== 'object') {
            throw new Error('Illegal argument. ' +
                'Strip can only be applied to objects');
        }
        object = Object.assign({}, object);
        if (typeof properties === 'string') {
            delete object[properties];
        } else if (Array.isArray(properties)) {
            properties.forEach(function(prop) {
                delete object[prop];
            });
        } else {
            throw new Error('Illegal argument. ' +
                'Strip "properties" argument must be string or array');
        }
        return object;
    },

    filter: function(object, pred) {
        if (typeof object !== 'object') {
            throw new Error('Illegal argument. ' +
                '`filter` can only be applied to objects');
        }
        if (Array.isArray(pred)) {
            var res = {};
            pred.forEach(function(key) {
                res[key] = object[key];
            });
            return res;
        } else {
            throw new Error('Illegal filter predicate. ' +
                '`filter` only accepts `Array`s as a predicate.');
        }
        // TODO: Add support for
        // - multiple predicates (via arguments)
        // - function predicates
    },

    requestTemplate: function(spec, options) {
        var tpl = new Template(spec, options);
        return function(model) {
            return tpl.expand(model);
        };
    },

    /**
     * Formats a date in a requested format
     *
     * @param date date to format
     * @param [format] optional format, defaults to RFC 822 format
     */
    date: function(date, format) {

        function isValidDate(d) {
            if (d.constructor !== Date) {
                return false;
            }
            return !isNaN(d.getTime());
        }

        format = format || 'rfc822';

        if (!isValidDate(date)) {
            var origDate = date;

            if (typeof date === 'string' && /^\d+$/.test(date)) {
                // It's a string, but may be it's just a stringified timestamp.
                // Check if it actually is.
                date = new Date(parseInt(date));
            } else {
                date = new Date(Date.parse(date));
            }

            if (!isValidDate(date)) {
                throw new Error('Invalid date: ' + origDate);
            }
        }

        switch (format) {
            case 'rfc822':
                return utils.toRFC822Date(date);
            case 'iso':
                return date.toISOString();
            default:
                throw new Error('Unsupported date format: ' + format);
        }
    },

    // Private helpers
    _optionalPath: function(element) {
        if (element !== undefined) {
            return '/' + encodeURIComponent(element);
        } else {
            return '';
        }
    },
    _encodeURIComponent: function(s) {
        s = (s === undefined || s === null) ? '' : s;
        if (/[^\w_-]/.test(s)) {
            return encodeURIComponent(s);
        } else {
            return s;
        }
    }
};

function splitAndPrepareTAssemblyTemplate(templateSpec, options) {
    options = options || {};
    var result = [];
    var templateNest = 0;
    var startIndex = 0;
    var currentTemplate;
    var inDoubleBrace = false;
    for (var index = 0; index < templateSpec.length; index++) {
        if (templateSpec[index] === '{') {
            if (templateNest === 0) { // We are either entering a new template
                if (startIndex !== index) {
                    result.push(templateSpec.substring(startIndex, index));
                }
                if (templateSpec[index + 1] === '{') {
                    index++;
                    inDoubleBrace = true;
                }
                startIndex = index + 1;
            } // Or entering an object literal
            templateNest++;
        } else if (templateSpec[index] === '}') {
            if (templateNest === 1) { // The current template is finished

                currentTemplate = templateSpec.substring(startIndex, index);

                if (!inDoubleBrace) {
                    if (/^\+/.test(currentTemplate)) {
                        // literal substitution, just strip the prefix.
                        currentTemplate = currentTemplate.substring(1);
                    } else if (/^\//.test(currentTemplate)) {
                        currentTemplate = '_optionalPath(' + currentTemplate.substring(1) + ')';
                    } else {
                        currentTemplate = '_encodeURIComponent(' + currentTemplate + ')';
                    }
                }

                if (inDoubleBrace && templateSpec[index + 1] === '}') {
                    index++;
                    inDoubleBrace = false;
                }

                var compiledExpression = compileExpression(currentTemplate, options.part);
                result.push(['raw', compiledExpression]);
                startIndex = index + 1;
            } // Or and object literal finished
            templateNest--;
        }
    }
    if (startIndex !== index) {
        result.push(templateSpec.substring(startIndex));
    }
    if (templateNest > 0) {
        throw new Error('Illegal template, unbalanced curly braces');
    }
    return result;
}

function compileTAssembly(template, reqPart, globals) {
    var res = '';
    var stringCb = function(bit) {
        if (bit !== undefined && bit !== null) {
            res += '' + bit;
        }
    };

    var options = {
        nestedTemplate: true,
        errorHandler: null,
        cb: stringCb,
        globals: globals || globalMethods,
    };
    try {
        var resolveTemplate = TAssembly.compile(template, options);
    } catch (e) {
        e.template = template;
        e.part = reqPart;
        throw e;
    }

    return function(context) {
        var childContext = {
            rc: context.rc,
            rm: context.rm,
            g: options.globals,
            options: context.options || options,
            cb: options.cb,
            m: (!reqPart && context.rm)
                || (context.rm.request && context.rm.request[reqPart]),
        };

        resolveTemplate(childContext);
        var value = res;
        res = ''; // Prepare for the next request.
        return value;
    };
}
// Check if this is a simple path template of the form /{domain}/foo/{bar}/,
// with each path segment either a plain string, or a simple variable
// reference without dots, function calls etc. No path segment can be a mix of
// a static string & a variable substitution.
var simpleTemplate = new RegExp('^(?:\\/(?:[a-zA-Z_\\.-]+|'
                // Sequence of plain path segments (above) or simple templated
                // segments (below).
                + '\\{[a-zA-Z_-]+\\}))*'
                // Followed optionally by one or more {/foo}, but not {+bar},
                // as URI can't correctly handle values without a leading
                // slash.
                + '\\/?(?:\\{\\/?[a-zA-Z_-]+\\})*\\/?$');

/**
 * Creates a template resolver functuons for URI part of the spec
 * @param {object} spec a root request spec object
 * @returns {Function} a template resolver which should be applied to resolve URI
 */

function createURIResolver(uri, globals) {
    if (simpleTemplate.test(uri) && uri.indexOf('{') >= 0) {
        var pathTemplate = new URI(uri, {}, true);
        return function(context) {
            return pathTemplate.expand(context.rm.request.params);
        };
    } else if (/\{/.test(uri)) {
        var tassemblyTemplate = splitAndPrepareTAssemblyTemplate(uri);
        // console.log('tass', spec.uri, tassemblyTemplate);
        return compileTAssembly(tassemblyTemplate, 'params', globals);
    } else {
        return function(context) {
            return uri;
        };
    }
}

/**
 * Rewrite a request template to a valid tassembly expression template.
 *
 * Copies the object on write.
 */
function replaceComplexTemplates(part, subSpec, globals) {
    if (subSpec && subSpec.constructor === Object) {
        var res = {};
        Object.keys(subSpec).forEach(function(key) {
            res[key] = replaceComplexTemplates(part, subSpec[key], globals);
        });
        return res;
    } else if (Array.isArray(subSpec)) {
        return subSpec.map(function(elem) {
            return replaceComplexTemplates(part, elem, globals);
        });
    } else if (subSpec && subSpec.constructor === String || subSpec === '') {
        if (/\{[^\}]+\}/.test(subSpec)) {
            // There is a template, now we need to check it for special stuff we replace
            var tAssemblyTemplates = splitAndPrepareTAssemblyTemplate(subSpec, { part: part });
            if (tAssemblyTemplates.length === 1
                    && tAssemblyTemplates[0].length === 2
                    && tAssemblyTemplates[0][0] === 'raw') {
                // Simple expression. Return verbatim.
                return tAssemblyTemplates[0][1];
            } else {
                // This is a string with partial templates
                // Compile a function
                var resolver = compileTAssembly(tAssemblyTemplates, part, globals);
                // Replace the complex template with a function call
                var fnName = 'fn_' + globals._i++;
                globals[fnName] = resolver;
                return 'rc.g.' + fnName + '(c)';
            }
        } else {
            // If it's not templated - wrap it into braces to let tassembly add it
            return "'" + subSpec + "'";
        }
    } else {
        // Other literals: Number, booleans
        return subSpec;
    }
    return subSpec;
}

function _cloneSpec(spec) {
    if (typeof spec === 'string') {
        return spec;
    } else {
        return Object.assign({}, spec);
    }
}

/**
 * Creates and compiles a new Template object using the provided JSON spec
 *
 * @param spec  Request spec provided in a Swagger spec. This is a JSON object
 *              containing all request parts templated in the form of {a.b.c}.
 *              Only fields in the spec would be included in the resulting request,
 *              fields that couldn't be resolved from original request would be ignored.
 * @param {object} globalsInit, an object to merge into the global namespace
 *              available in the template.
 */
function Template(origSpec, globalsInit) {
    var self = this;
    var globals = Object.assign({}, globalMethods, globalsInit);
    var spec = _cloneSpec(origSpec);
    globals._i = 0;

    if (typeof spec === 'string') {
        spec = replaceComplexTemplates(undefined, spec, globals);
    } else {
        Object.keys(spec).forEach(function(part) {
            if (part === 'uri') {
                globals._uri = createURIResolver(spec.uri, globals);
                spec.uri = 'rc.g._uri(c)';
            } else {
                spec[part] = replaceComplexTemplates(part, spec[part], globals);
            }
        });
    }

    var completeTAssemblyTemplate = expressionCompiler.stringify(spec);
    // console.log(origSpec, completeTAssemblyTemplate);
    var res = null;
    var objectCb = function(bit) {
        if (res === null) {
            res = bit;
        }
    };

    var resolver;
    try {
        resolver = TAssembly.compile([['raw', completeTAssemblyTemplate]], {
            nestedTemplate: true,
            globals: globals,
            cb: objectCb,
            errorHandler: null,
        });
    } catch (e) {
        e.spec = origSpec;
        e.tassembly = completeTAssemblyTemplate;
        throw e;
    }

    var c = {
        rc: null,
        rm: null,
        g: globals,
        cb: objectCb,
        m: null,
    };
    c.rc = c;
    self.expand = function(m) {
        c.rm = m;
        c.m = m;
        try {
            resolver(c);
        } catch (e) {
            e.expression_tassembly = completeTAssemblyTemplate;
            e.expression_spec = origSpec;
            res = null;
            throw e;
        }
        var ret = res;
        res = null;
        // ensure a reasonable fallback for ret.method
        if (ret && ret.hasOwnProperty('method')) {
            ret.method = ret.method || 'get';
        }
        return ret;
    };
}

/**
 * Evaluates the compiled template using the provided request
 *
 * @param {object} context a context object where to take data from
 * @returns {object} a new request object with all templates either substituted or dropped
 */
Template.prototype.expand = null;

module.exports = Template;
