"use strict";

// mocha defines to avoid JSHint breakage
/* global describe, it, before, beforeEach, after, afterEach */

var URI = require('../../index').URI;
var Template = require('../../index').Template;
var assert = require('../utils/assert');

describe('Request template', function() {
    it('should correctly resolve request templates', function() {
        var requestTemplate = {
            uri: '/{domain}/test',
            method: 'post',
            headers: {
                'name-with-dashes': '{name-with-dashes}',
                'global-header': '{$.request.params.domain}',
                'added-string-header': 'added-string-header'
            },
            query: {
                'simple': '{simple}',
                'added': 'addedValue',
                'global': '{$.request.headers.name-with-dashes}'
            },
            body: {
                'object': '{object}',
                'global': '{$.request.params.domain}',
                'added': 'addedValue',
                'nested': {
                    'one': {
                        'two': {
                            'tree': '{a.b.c}'
                        }
                    }
                },
                'field_name_with_underscore': '{field_name_with_underscore}',
                'additional_context_field': '{$.additional_context.field}',
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
                'field_name_with_underscore': 'field_value_with_underscore'
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
                'field_name_with_underscore': 'field_value_with_underscore',
                additional_context_field: 'additional_test_value',
                'string_templated': 'test field_value_with_underscore'
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
        assert.deepEqual(result.uri,
        new URI('http://en.wikipedia.org/path1/{path2}', {}, true).expand({
            path2: 'test1/test2/test3'
        }));
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
        assert.deepEqual(resultNoOptional.uri, new URI('/en.wikipedia.org/path1{/optional}', {}, true).expand());
        var resultWithOptional = new Template(requestTemplate).expand({
            request: {
                params: {
                    domain: 'en.wikipedia.org',
                    optional: 'value'
                }
            }
        });
        assert.deepEqual(resultWithOptional.uri, new URI('/en.wikipedia.org/path1{/optional}', {}, true).expand({
            optional: 'value'
        }));
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
        assert.deepEqual(result.uri,
        new URI('http://en.wikipedia.org/path1/{+path}', {}, true).expand({
            path: 'test1/test2/test3'
        }));
    });

    it('should support templating the whole uri', function() {
        var requestTemplate = {
            uri: '{uri}'
        };
        var result = new Template(requestTemplate).expand({
            request: {
                params: {
                    uri: 'en.wikipedia.org/path1/test1/test2/test3'
                }
            }
        });
        assert.deepEqual(result.uri, new URI('en.wikipedia.org/path1/test1/test2/test3', {}, false));
    });

    it('absolute templates in URI', function() {
        var template = new Template({
            uri: '/path/{$.request.headers.host}/{$.request.body}'
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

    it('supports default values in req templates', function() {
        var template = new Template({
            uri: '/path/{$$.default($.request.body.test, "default")}',
            body: {
                complete: '{$$.default($.request.body.test, "default")}',
                partial: '/test/{$$.default($.request.body.test, "default")}',
                withObject: '{$$.default($.request.body.test, {temp: "default"})}'
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
        assert.deepEqual(evaluatedDefaults.uri, '/path/default');
        assert.deepEqual(evaluatedDefaults.body.complete, 'default');
        assert.deepEqual(evaluatedDefaults.body.partial, '/test/default');
        assert.deepEqual(evaluatedDefaults.body.withObject, {temp: 'default'});
    });

    it('should support merging objects in templates', function() {
        var template = new Template({
            body: {
                merged: '{$$.merge($.request.body.first, second)}'
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
});