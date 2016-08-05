"use strict";

// mocha defines to avoid JSHint breakage
/* global describe, it, before, beforeEach, after, afterEach */

var URI = require('../../index').URI;
var Template = require('../../index').Template;
var assert = require('assert');

describe('Request template', function() {
    it('should correctly resolve request templates', function() {
        var requestTemplate = {
            uri: '/{domain}/test',
            method: 'post',
            headers: {
                'name-with-dashes': '{{name-with-dashes}}',
                'global-header': '{{request.params.domain}}',
                'added-string-header': 'added-string-header'
            },
            query: {
                'simple': '{{simple}}',
                'added': 'addedValue',
                'global': '{{request.headers.name-with-dashes}}'
            },
            body: {
                'object': '{{object}}',
                'global': '{{request.params.domain}}',
                'added': 'addedValue',
                'nested': {
                    'one': {
                        'two': {
                            'tree': '{{request.body.a.b.c}}'
                        }
                    }
                },
                'field_name_with_underscore': '{{field_name_with_underscore}}',
                'additional_context_field': '{{additional_context.field}}',
                'string_templated': 'test {field_name_with_underscore}'
            }
        };
        var testRequest = {
            params: {
                'domain': 'testDomain'
            },
            method: 'get',
            headers: {
                'name-with-dashes': 'name-with-dashes-value',
                'removed-header': 'this-will-be-removed'
            },
            query: {
                'simple': 'simpleValue',
                'removed': 'this-will-be-removed'
            },
            body: {
                'object': {
                    'testField': 'testValue'
                },
                'removed': {
                    'field': 'this-will-be-removed'
                },
                'a': {
                    'b': {
                        'c': 'nestedValue'
                    }
                },
                'field_name_with_underscore': 'field_value_with_underscore/'
            }
        };
        var expectedTemplatedRequest = {
            uri: new URI('testDomain/test'),
            method: 'post',
            headers: {
                'name-with-dashes': 'name-with-dashes-value',
                'global-header': 'testDomain',
                'added-string-header': 'added-string-header'
            },
            query: {
                'simple': 'simpleValue',
                'added': 'addedValue',
                'global': 'name-with-dashes-value'
            },
            body: {
                'object': {
                    'testField': 'testValue'
                },
                'global': 'testDomain',
                'added': 'addedValue',
                'nested': {
                    'one': {
                        'two': {
                            'tree': 'nestedValue'
                        }
                    }
                },
                'field_name_with_underscore': 'field_value_with_underscore/',
                additional_context_field: 'additional_test_value',
                // Note how the slash is encoded, as the template is using
                // single braces.
                'string_templated': 'test field_value_with_underscore%2F'
            }
        };
        var result = new Template(requestTemplate).expand({
            request: testRequest,
            additional_context: {
                field: 'additional_test_value'
            }
        });
        assert.deepEqual(result, expectedTemplatedRequest);
    });

    it('should encode uri components', function() {
        var requestTemplate = {
            uri: 'http://{domain}/path1/{path2}'
        };
        var result = new Template(requestTemplate).expand({
            request: {
                params: {
                    domain: 'en.wikipedia.org',
                    path2: 'test1/test2/test3'
                }
            }
        });
        assert.deepEqual(result.uri.toString(),
        new URI('http://en.wikipedia.org/path1/{path2}', {}, true).expand({
            path2: 'test1/test2/test3'
        }).toString());
    });

    it('should support optional path elements in uri template', function() {
        var requestTemplate = {
            uri: '/{domain}/path1{/optional}'
        };
        var resultNoOptional = new Template(requestTemplate).expand({
            request: {
                params: {
                    domain: 'en.wikipedia.org'
                }
            }
        });
        assert.deepEqual(resultNoOptional.uri.toString(),
                new URI('/en.wikipedia.org/path1{/optional}', {}, true).expand().toString());
        var resultWithOptional = new Template(requestTemplate).expand({
            request: {
                params: {
                    domain: 'en.wikipedia.org',
                    optional: 'value'
                }
            }
        });
        assert.deepEqual(resultWithOptional.uri.toString(), new URI('/en.wikipedia.org/path1{/optional}', {}, true).expand({
            optional: 'value'
        }).toString());
    });

    it('should omit optional path segments', function() {
        var requestTemplate = {
            uri: '/{domain}{/a}{/b}{+path}'
        };
        var resultNoOptional = new Template(requestTemplate).expand({
            request: {
                params: {
                    domain: 'en.wikipedia.org',
                    b: 'b',
                    path: '/path'
                }
            }
        }).uri.toString();
        assert.deepEqual(resultNoOptional, '/en.wikipedia.org/b/path');
        var resultWithOptional = new Template(requestTemplate).expand({
            request: {
                params: {
                    domain: 'en.wikipedia.org',
                    a: 'a',
                }
            }
        }).uri.toString();
        assert.deepEqual(resultWithOptional, '/en.wikipedia.org/a');
    });

    it('should support + templates in path', function() {
        var requestTemplate = {
            uri: 'http://{domain}/path1/{+path}'
        };
        var result = new Template(requestTemplate).expand({
            request: {
                params: {
                    domain: 'en.wikipedia.org',
                    path: 'test1/test2/test3'
                }
            }
        });
        assert.deepEqual(result.uri.toString(),
        new URI('http://en.wikipedia.org/path1/{+path}', {}, true).expand({
            path: [
                'test1/test2/test3'
            ]
        }).toString());
    });

    it('should support templating the whole uri', function() {
        var requestTemplate = {
            uri: '{+uri}'
        };
        var result = new Template(requestTemplate).expand({
            request: {
                params: {
                    uri: 'en.wikipedia.org/path1/test1/test2/test3'
                }
            }
        });
        assert.deepEqual(result.uri.toString(), 'en.wikipedia.org/path1/test1/test2/test3');
    });

    it('absolute templates in URI', function() {
        var template = new Template({
            uri: '/path/{request.headers.host}/{request.body}'
        });
        var request = {
            method: 'post',
            headers: {
                'host': 'test'
            },
            body: 'a'
        };
        assert.deepEqual(template.expand({request:request}).uri, '/path/test/a');
    });

    it('allows req.method to be templated', function() {
        var template = new Template({
            uri: '/foo/bar/baz',
            method: '{{request.method}}'
        });
        var evalWithMethod = template.expand({ request: { method: 'post' } });
        assert.deepEqual(evalWithMethod.method, 'post');
        var evalWithoutMethod = template.expand({ request: {} });
        assert.deepEqual(evalWithoutMethod.method, 'get');
    });

    it('supports default values in req templates', function() {
        var template = new Template({
            uri: '/path/{default(request.body.test, "foo/bar")}',
            body: {
                complete: '{{default(request.body.test, "default")}}',
                partial: '/test/{{default(request.body.test, "default")}}',
                withObject: '{{default(request.body.test, {temp: "default"})}}'
            }
        });
        var evaluatedNoDefaults = template.expand({
            request: {
                method: 'get',
                body: {
                    test: 'value'
                }
            }
        });
        assert.deepEqual(evaluatedNoDefaults.uri, '/path/value');
        assert.deepEqual(evaluatedNoDefaults.body.complete, 'value');
        assert.deepEqual(evaluatedNoDefaults.body.partial, '/test/value');
        assert.deepEqual(evaluatedNoDefaults.body.withObject, 'value');
        var evaluatedDefaults = template.expand({
            request: {
                method: 'get',
                body: {}
            }
        });
        assert.deepEqual(evaluatedDefaults.uri, '/path/foo%2Fbar');
        assert.deepEqual(evaluatedDefaults.body.complete, 'default');
        assert.deepEqual(evaluatedDefaults.body.partial, '/test/default');
        assert.deepEqual(evaluatedDefaults.body.withObject, {temp: 'default'});
    });

    it('should support merging objects in templates', function() {
        var template = new Template({
            body: {
                merged: '{{merge(request.body.first, second)}}'
            }
        });
        var evaluated = template.expand({
            request: {
                method: 'get',
                body: {
                    first: {
                        noOverwrite: 'noOverwrite',
                        notCopied: 'notCopied'
                    },
                    second: {
                        noOverwrite: 'OVERWRITED!',
                        extra: 'extra'
                    }
                }
            }
        });
        assert.deepEqual(evaluated.body.merged, {
            noOverwrite: 'noOverwrite',
            notCopied: 'notCopied',
            extra: 'extra'
        });
    });

    it('should support string templates', function() {
        var template = new Template('{{request}}');
        var request = {
            method: 'get',
            uri: 'test.com',
            body: {
                field: 'value'
            }
        };
        var result = template.expand({ request: request });
        assert.deepEqual(result, request);
    });

    it('should support short notation in string templates', function() {
        var template = new Template('{{request}}');
        var request = {
            method: 'get',
            uri: 'test.com',
            body: {
                field: 'value'
            }
        };
        var result = template.expand({ request: request });
        assert.deepEqual(result, request);
    });

    it('should support short nested notation in string templates', function() {
        var template = new Template('{{request.method}}');
        var request = {
            method: 'get',
            uri: 'test.com',
            body: {
                field: 'value'
            }
        };
        var result = template.expand({ request: request });
        assert.deepEqual(result, 'get');
    });

    it('should support short nested notation with brackets in string templates', function() {
        var template = new Template('{{request[request.body.field]}}');
        var request = {
            method: 'get',
            uri: 'test.com',
            body: {
                field: 'method'
            }
        };
        var result = template.expand({ request: request });
        assert.deepEqual(result, 'get');
    });

    it('should strip the object', function() {
        var template = new Template({
            method: 'get',
            uri: 'test.com',
            headers: '{{strip(request.headers, "removed_header")}}',
            body: '{{strip(request.body, ["removed_field1", "removed_field2"])}}'
        });
        var result = template.expand({
            request: {
                headers: {
                    not_removed_header: 'value',
                    removed_header: 'value'
                },
                body: {
                    not_removed_field: 'value',
                    removed_field1: 'value',
                    removed_field2: 'value'
                }
            }
        });
        assert.deepEqual(result.headers.not_removed_header, 'value');
        assert.deepEqual(result.headers.removed_header, undefined);
        assert.deepEqual(result.body.not_removed_field, 'value');
        assert.deepEqual(result.body.removed_field1, undefined);
        assert.deepEqual(result.body.removed_field2, undefined);
    });

    /**
     * New-style un-prefixed globals & calls
     */

    it('should support un-prefixed dotted paths & the global accessor', function() {
        var template = new Template('{{request[request.body.field]}}');
        var request = {
            method: 'get',
            uri: 'test.com',
            body: {
                field: 'method'
            }
        };
        var result = template.expand({ request: request });
        assert.deepEqual(result, 'get');
    });

    it('should support un-prefixed calls', function() {
        var template = new Template('{{default(request.foo, request[request.body.field])}}');
        var request = {
            method: 'get',
            uri: 'test.com',
            body: {
                field: 'method'
            }
        };
        var result = template.expand({ request: request });
        assert.deepEqual(result, 'get');
    });

    it('should support double brace syntax', function() {
        var template = new Template('{{default(request.foo, request[request.body.field])}}');
        var request = {
            method: 'get',
            uri: 'test.com',
            body: {
                field: 'method'
            }
        };
        var result = template.expand({ request: request });
        assert.deepEqual(result, 'get');
    });

    it('should support double brace syntax in uri as well', function() {
        var template = new Template({
            uri: '{{options.host}}/{foo}/',
            headers: {
                bar: '{{bar}}',
                baz: '{baz}',
            }
        });
        var request = {
            headers: {
                bar: 'a/bar',
                baz: 'a/baz',
            },
            uri: 'test.com',
            body: {
                field: 'method'
            },
            params: {
                foo: 'a/foo',
            }
        };
        var result = template.expand({ request: request, options: { host: '/a/host' } });
        assert.deepEqual(result, {
            uri: '/a/host/a%2Ffoo/',
            headers: {
                bar: 'a/bar',
                baz: 'a%2Fbaz',
            }
        });
    });

    it('should support filtering', function() {
        var template = new Template({
            uri: '{{options.host}}/{foo}/',
            headers: '{{filter(request.headers, ["bar","baz"])}}',
        });
        var request = {
            headers: {
                bar: 'a/bar',
                baz: 'a/baz',
                boo: 'a/boo',
            },
            uri: 'test.com',
            body: {
                field: 'method'
            },
            params: {
                foo: 'a/foo',
            }
        };
        var result = template.expand({ request: request, options: { host: '/a/host' } });
        assert.deepEqual(result, {
            uri: '/a/host/a%2Ffoo/',
            headers: {
                bar: 'a/bar',
                baz: 'a/baz',
            }
        });
    });

    it('should support newlines in expressions', function() {
        var template = new Template({
            uri: '{{options.host}}/{foo}/',
            headers: '{{filter(\nrequest.headers, \n["bar","baz"])\n }}',
        });
        var request = {
            headers: {
                bar: 'a/bar',
                baz: 'a/baz',
                boo: 'a/boo',
            },
            uri: 'test.com',
            body: {
                field: 'method'
            },
            params: {
                foo: 'a/foo',
            }
        };
        var result = template.expand({ request: request, options: { host: '/a/host' } });
        assert.deepEqual(result, {
            uri: '/a/host/a%2Ffoo/',
            headers: {
                bar: 'a/bar',
                baz: 'a/baz',
            }
        });
    });

    it('should support newlines in expressions', function() {
        var template = new Template({
            uri: '{{options.host}}/{foo}/',
            headers: '{{filter(\nrequest.headers, \n["bar","baz"])\n }}',
        });
        var request = {
            headers: {
                bar: 'a/bar',
                baz: 'a/baz',
                boo: 'a/boo',
            },
            uri: 'test.com',
            body: {
                field: 'method'
            },
            params: {
                foo: 'a/foo',
            }
        };
        var result = template.expand({ request: request, options: { host: '/a/host' } });
        assert.deepEqual(result, {
            uri: '/a/host/a%2Ffoo/',
            headers: {
                bar: 'a/bar',
                // FIXME: This will change in the future!
                baz: 'a/baz',
            }
        });
    });

    it('should correctly resolve 0 value', function() {
        var template = new Template({
            uri: 'http://test.com/{rev}',
            headers: 'test_{test_header}'
        });
        var result = template.expand({
            request: {
                params: {
                    rev: 0
                },
                headers: {
                    test_header: 0
                }
            }
        });
        assert.deepEqual(result, {
            uri: 'http://test.com/0',
            headers: 'test_0'
        });
    });

    it('should support date formats', function() {
        var template = new Template({
            body: {
                date_iso: '{{date(request.body.date, "iso")}}',
                date_rfc822: '{{date(request.body.date)}}'
            }
        });
        var result = template.expand({
            request: {
                body: {
                    date: '1990-02-20T19:31:13+00:00'
                }
            }
        });
        assert.deepEqual(result, {
            body: {
                date_iso: '1990-02-20T19:31:13.000Z',
                date_rfc822: 'Tue, 20 Feb 1990 19:31:13 +0000'
            }
        });
        result = template.expand({
            request: {
                body: {
                    date: '1234'
                }
            }
        });
        assert.deepEqual(result, {
            body: {
                date_iso: '1970-01-01T00:00:01.234Z',
                date_rfc822: 'Thu, 01 Jan 1970 00:00:01 +0000'
            }
        });
    });
});
