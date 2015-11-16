"use strict";

require('core-js/shim');
var URI = require('./uri');
var url = require('url');
var TAssembly = require('tassembly');
var expressionCompiler = require('template-expression-compiler');

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
    _optionalPath: function(element) {
        if (element !== undefined) {
            return '/' + encodeURIComponent(element);
        } else {
            // Terminate the path
            throw '';
        }
    },
    _encodeURIComponent: function(s) {
        s = s || '';
        if (/[^\w_-]/.test(s)) {
            return encodeURIComponent(s);
        } else {
            return s;
        }
    }
};

function splitAndPrepareTAsseblyTemplate(templateSpec, options) {
    options = options || {};
    var result = [];
    var templateNest = 0;
    var startIndex = 0;
    var currentTemplate;
    for (var index = 0; index < templateSpec.length; index++) {
        if (templateSpec[index] === '{') {
            if (templateNest === 0) { // We are either entering a new template
                if (startIndex !== index) {
                    result.push(templateSpec.substring(startIndex, index));
                }
                startIndex = index + 1;
            } // Or entering an object literal
            templateNest++;
        } else if (templateSpec[index] === '}') {
            if (templateNest === 1) { // The current template is finished
                currentTemplate = templateSpec.substring(startIndex, index);
                if (options.isURI) {
                    if (/^\+/.test(currentTemplate)) {
                        // literal substitution, just strip the prefix.
                        currentTemplate = currentTemplate.substring(1);
                    } else if (/^\//.test(currentTemplate)) {
                        currentTemplate = '$$._optionalPath(' + currentTemplate.substring(1) + ')';
                    } else {
                        currentTemplate = '$$._encodeURIComponent(' + currentTemplate + ')';
                    }
                }

                var compiledExpression = expressionCompiler.parse(currentTemplate.trim());
                // FIXME: Rewrite path prefixes in expressionCompiler!
                if (options.part) {
                    compiledExpression = compiledExpression.replace(/([,(\[:])m\./g,
                                '$1rm.' + options.part + '.');
                }
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

function errorHandler(e) {
    return undefined;
}

function compileTAssembly(template, reqPart, globals) {
    var res;
    var callback = function(bit) {
        if (res === undefined) {
            res = bit;
        } else {
            res += '' + bit;
        }
    };

    var options = {
        nestedTemplate: true,
        errorHandler: errorHandler,
        cb: callback,
        globals: globals || globalMethods,
    };
    var resolveTemplate = TAssembly.compile(template, options);

    return function(context) {
        var childContext = {
            rc: context.rc,
            rm: context.rm,
            g: options.globals,
            options: context.options || options,
            cb: options.cb,
            m: context.rm.request[reqPart],
        };

        resolveTemplate(childContext);
        var value = res;
        res = undefined; // Unitialize res to prepare to the next request
        return value;
    };
}

/**
 * Creates a template resolver functuons for URI part of the spec
 * @param {object} spec a root request spec object
 * @returns {Function} a template resolver which should be applied to resolve URI
 */

function createURIResolver(uri, globals) {
    // Check if this is a simple path template
    if (/^\/(?:[^{]*\{[\/\+]?[a-zA-Z_-]+\}[^{]*)*$/.test(uri)) {
        var pathTemplate = new URI(uri, {}, true);
        return function(context) {
            return pathTemplate.expand(context.rm.request.params);
        };
    } else if (/\{/.test(uri)) {
        var tassemblyTemplate = splitAndPrepareTAsseblyTemplate(uri, { isURI: true });
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
        if (/\{.*\}/.test(subSpec)) {
            // There is a template, now we need to check it for special stuff we replace
            if (/^\{[^\}\[]+\}$/.test(subSpec)) {
                // Simple variable: Remove braces
                subSpec = subSpec.substring(1, subSpec.length - 1);
                // FIXME: Replace with proper rewriting using the expression
                // compiler.
                subSpec = subSpec.replace(/([,(\[:] *)([a-z_])/g,
                            '$1$.request.' + part + '.$2');
            }
            if (!/^[\$'"]/.test(subSpec) && !/[\{\[\(]/.test(subSpec)) {
                // Simple local reference
                // XXX: won't handle nested references
                if (part) {
                    return '$.request.' + part + '.' + subSpec;
                } else {
                    return '$.' + subSpec;
                }
            } else {
                var tAssemblyTemplates = splitAndPrepareTAsseblyTemplate(subSpec, { part: part });
                if (tAssemblyTemplates.length > 1) {
                    // This is a string with partial templates
                    // Compile a function
                    var resolver = compileTAssembly(tAssemblyTemplates, part, globals);
                    // Replace the complex template with a function call
                    var fnName = 'fn_' + globals._i++;
                    globals[fnName] = resolver;
                    return '$$.' + fnName + '($context)';
                } else if (/^\{.*\}$/.test(subSpec)) {
                    // If it's a simple and resolvable function - just remove the braces
                    return subSpec.substring(1, subSpec.length - 1);
                } else {
                    return subSpec;
                }
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
function Template(spec, globalsInit) {
    var self = this;
    var globals = Object.assign({}, globalMethods, globalsInit);
    spec = _cloneSpec(spec);
    globals._i = 0;

    if (typeof spec === 'string') {
        spec = replaceComplexTemplates(undefined, spec, globals);
    } else {
        Object.keys(spec).forEach(function(part) {
            if (part === 'uri') {
                globals._uri = createURIResolver(spec.uri, globals);
                spec.uri = '$$._uri($context)';
            } else if (part === 'method') {
                spec.method = "'" + (spec.method || 'get') + "'";
            } else {
                spec[part] = replaceComplexTemplates(part, spec[part], globals);
            }
        });
    }

    var completeTAssemblyTemplate = expressionCompiler.parse(spec);
    var res;
    var callback = function(bit) {
        if (res === undefined) {
            res = bit;
        } else {
            res += '' + bit;
        }
    };
    var resolver = TAssembly.compile([['raw', completeTAssemblyTemplate]], {
        nestedTemplate: true,
        globals: globals,
        cb: callback,
        errorHandler: errorHandler
    });
    var options = {
        errorHandler: errorHandler
    };
    var c = {
        rc: null,
        rm: null,
        g: globals,
        options: options,
        cb: callback,
        m: null,
    };
    c.rc = c;
    self.expand = function(m) {
        c.rm = m;
        c.m = m;
        resolver(c);
        var ret = res;
        res = undefined;
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
