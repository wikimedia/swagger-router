'use strict';

const URI = require('./uri');
const TAssembly = require('tassembly');
const expressionCompiler = require('template-expression-compiler');
const utils = require('./utils');
const uuidv1 = require('uuid/v1');

const compilerOptions = {
    ctxMap: {
        $: 'rm',
        $$: 'rc.g',
        globals: 'rm',
        // `global` is deprecated, as `globals` (plural) is more consistent
        // with `options` & the code.
        // TODO: Remove!
        global: 'rm'
    },
    dottedPathPrefix: 'rm',
    callPrefix: 'rc.g',
    modelPrefix: 'm'
};

function compileExpression(expression, part) {
    // Convert the expression to a single line & remove whitespace.
    expression = expression.replace(/\n/g, ' ').trim();
    compilerOptions.modelPrefix = (part && `rm.request.${part}`) || 'm';
    return expressionCompiler.parse(expression, compilerOptions);
}

const globalMethods = {
    default(val, defVal) {
        return val || defVal;
    },
    merge(destination, source) {
        destination = destination || {};
        source = source || {};

        if (typeof destination !== 'object' || typeof source !== 'object') {
            throw new Error('Illegal argument. ' +
                'Merge source and destination must be objects');
        }

        const result = Object.assign({}, destination);
        Object.keys(source).forEach((keyName) => {
            if (result[keyName] === undefined) {
                result[keyName] = source[keyName];
            }
        });
        return result;
    },
    strip(object, properties) {
        if (typeof object !== 'object') {
            throw new Error('Illegal argument. ' +
                'Strip can only be applied to objects');
        }
        object = Object.assign({}, object);
        if (typeof properties === 'string') {
            delete object[properties];
        } else if (Array.isArray(properties)) {
            properties.forEach((prop) => {
                delete object[prop];
            });
        } else {
            throw new Error('Illegal argument. ' +
                'Strip "properties" argument must be string or array');
        }
        return object;
    },

    filter(object, pred) {
        if (typeof object !== 'object') {
            throw new Error('Illegal argument. ' +
                '`filter` can only be applied to objects');
        }
        if (Array.isArray(pred)) {
            const res = {};
            pred.forEach((key) => {
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

    requestTemplate(spec, options) {
        // eslint-disable-next-line no-use-before-define
        const tpl = new Template(spec, options);
        return (model) => tpl.expand(model);
    },

    /**
     * Formats a date in a requested format
     * @param  {Object} date     date to format
     * @param  {string} [format] optional format, defaults to RFC 822 format
     * @return {string}
     *
     * @throws {Error}
     */
    date(date, format) {

        function isValidDate(d) {
            if (d.constructor !== Date) {
                return false;
            }
            return !isNaN(d.getTime());
        }

        format = format || 'rfc822';

        if (!isValidDate(date)) {
            const origDate = date;

            if (typeof date === 'string' && /^\d+$/.test(date)) {
                // It's a string, but may be it's just a stringified timestamp.
                // Check if it actually is.
                date = new Date(parseInt(date, 10));
            } else {
                date = new Date(Date.parse(date));
            }

            if (!isValidDate(date)) {
                throw new Error(`Invalid date: ${origDate}`);
            }
        }

        switch (format) {
            case 'rfc822':
                return utils.toRFC822Date(date);
            case 'iso':
                return date.toISOString();
            case 'timeuuid':
                return uuidv1({ msecs: date.getTime() });
            default:
                throw new Error(`Unsupported date format: ${format}`);
        }
    },

    timeuuid() {
        return uuidv1();
    },

    /**
     * Applies `decodeURIComponent` to the provided string
     * @param  {string} data  data needed to be decoded.
     * @return {string}
     */
    decode(data) {
        if (typeof data !== 'string') {
            return data;
        }
        return decodeURIComponent(data);
    },

    // Private helpers
    _optionalPath(element) {
        if (element !== undefined) {
            return `/${encodeURIComponent(element)}`;
        } else {
            return '';
        }
    },
    _encodeURIComponent(s) {
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
    const result = [];
    let templateNest = 0;
    let startIndex = 0;
    let currentTemplate;
    let inDoubleBrace = false;
    let index;
    for (index = 0; index < templateSpec.length; index++) {
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
                        currentTemplate = `_optionalPath(${currentTemplate.substring(1)})`;
                    } else {
                        currentTemplate = `_encodeURIComponent(${currentTemplate})`;
                    }
                }

                if (inDoubleBrace && templateSpec[index + 1] === '}') {
                    index++;
                    inDoubleBrace = false;
                }

                const compiledExpression = compileExpression(currentTemplate, options.part);
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
    let resolveTemplate;
    let res = '';
    const stringCb = (bit) => {
        if (bit !== undefined && bit !== null) {
            res += `${bit}`;
        }
    };

    const options = {
        nestedTemplate: true,
        errorHandler: null,
        cb: stringCb,
        globals: globals || globalMethods
    };

    try {
        resolveTemplate = TAssembly.compile(template, options);
    } catch (e) {
        e.template = template;
        e.part = reqPart;
        throw e;
    }

    return (context) => {
        const childContext = {
            rc: context.rc,
            rm: context.rm,
            g: options.globals,
            options: context.options || options,
            cb: options.cb,
            m: (!reqPart && context.rm) ||
                (context.rm.request && context.rm.request[reqPart])
        };

        resolveTemplate(childContext);
        const value = res;
        res = ''; // Prepare for the next request.
        return value;
    };
}
// Check if this is a simple path template of the form /{domain}/foo/{bar}/,
// with each path segment either a plain string, or a simple variable
// reference without dots, function calls etc. No path segment can be a mix of
// a static string & a variable substitution.
const simpleTemplate = new RegExp('^(?:\\/(?:[a-zA-Z_\\.-]+|' +
                // Sequence of plain path segments (above) or simple templated
                // segments (below).
                '\\{[a-zA-Z_-]+\\}))*' +
                // Followed optionally by one or more {/foo}, but not {+bar},
                // as URI can't correctly handle values without a leading
                // slash.
                '\\/?(?:\\{\\/?[a-zA-Z_-]+\\})*\\/?$');

/**
 * Creates a template resolver functions for URI part of the spec.
 * @param {string} uri the URI template string.
 * @param {Object} globals the global parameters and functions map.
 * @return Function
 */

function createURIResolver(uri, globals) {
    if (simpleTemplate.test(uri) && uri.indexOf('{') >= 0) {
        const pathTemplate = new URI(uri, {}, true);
        return (context) => pathTemplate.expand(context.rm.request.params);
    } else if (/{/.test(uri)) {
        const tassemblyTemplate = splitAndPrepareTAssemblyTemplate(uri);
        const tassemblyResolver = compileTAssembly(tassemblyTemplate, 'params', globals);
        return (context) => new URI(tassemblyResolver(context));
    } else {
        return () => new URI(uri);
    }
}

/**
 * Rewrite a request template to a valid tassembly expression template.
 *
 * Copies the object on write.
 * @param  {string} part
 * @param  {Object} subSpec
 * @param  {Object} globals
 * @return {Object}
 */
function replaceComplexTemplates(part, subSpec, globals) {
    if (subSpec && subSpec.constructor === Object) {
        const res = {};
        Object.keys(subSpec).forEach((key) => {
            res[key] = replaceComplexTemplates(part, subSpec[key], globals);
        });
        return res;
    } else if (Array.isArray(subSpec)) {
        return subSpec.map((elem) => replaceComplexTemplates(part, elem, globals));
    } else if (subSpec && subSpec.constructor === String || subSpec === '') {
        if (/\{[^}]+\}/.test(subSpec)) {
            // Strip trailing newlines, so that we can use yaml multi-line
            // syntax like this:
            // someKey: >
            //   {{ merge ({
            //        "someKey": "foo",
            //        "otherKey": "bar"
            //      }, options }}
            if (/^\{[\w\W]*\}\n$/m.test(subSpec)) {
                subSpec = subSpec.replace(/\n$/, '');
            }
            // There is a template, now we need to check it for special stuff we replace
            const tAssemblyTemplates = splitAndPrepareTAssemblyTemplate(subSpec, { part });
            if (tAssemblyTemplates.length === 1 &&
                    tAssemblyTemplates[0].length === 2 &&
                    tAssemblyTemplates[0][0] === 'raw') {
                // Simple expression. Return verbatim.
                return tAssemblyTemplates[0][1];
            } else {
                // This is a string with partial templates
                // Compile a function
                const resolver = compileTAssembly(tAssemblyTemplates, part, globals);
                // Replace the complex template with a function call
                const fnName = `fn_${globals._i++}`;
                globals[fnName] = resolver;
                return `rc.g.${fnName}(c)`;
            }
        } else {
            // If it's not templated - wrap it into braces to let tassembly add it
            return `'${subSpec}'`;
        }
    }
    // Other literals: Number, booleans
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
 * @param {Object} origSpec      Request spec provided in a Swagger spec. This is a JSON object
 *                               containing all request parts templated in the form of {a.b.c}.
 *                               Only fields in the spec would be included in the resulting request,
 *                               fields that couldn't be resolved from original request would be
 *                               ignored.
 * @param  {Object} globalsInit, an object to merge into the global namespace available in the
 *                               template.
 */
class Template {
    constructor(origSpec, globalsInit) {
        const globals = Object.assign({}, globalMethods, globalsInit);
        let spec = _cloneSpec(origSpec);
        globals._i = 0;

        if (typeof spec === 'string') {
            spec = replaceComplexTemplates(undefined, spec, globals);
        } else {
            Object.keys(spec).forEach((part) => {
                if (part === 'uri') {
                    globals._uri = createURIResolver(spec.uri, globals);
                    spec.uri = 'rc.g._uri(c)';
                } else {
                    spec[part] = replaceComplexTemplates(part, spec[part], globals);
                }
            });
        }

        const completeTAssemblyTemplate = expressionCompiler.stringify(spec);
        let res = null;
        const objectCb = (bit) => {
            if (res === null) {
                res = bit;
            }
        };

        let resolver;
        try {
            resolver = TAssembly.compile([['raw', completeTAssemblyTemplate]], {
                nestedTemplate: true,
                globals,
                cb: objectCb,
                errorHandler: null
            });
        } catch (e) {
            e.spec = origSpec;
            e.tassembly = completeTAssemblyTemplate;
            throw e;
        }

        const c = {
            rc: null,
            rm: null,
            g: globals,
            cb: objectCb,
            m: null
        };
        c.rc = c;
        this.expand = (m) => {
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
            const ret = res;
            res = null;
            // ensure a reasonable fallback for ret.method
            if (ret && {}.hasOwnProperty.call(ret, 'method')) {
                ret.method = ret.method || 'get';
            }
            return ret;
        };
    }
}

/**
 * Evaluates the compiled template using the provided request
 *
 * @param {object} context a context object where to take data from
 * @returns {object} a new request object with all templates either substituted or dropped
 */
Template.prototype.expand = null;

module.exports = Template;
