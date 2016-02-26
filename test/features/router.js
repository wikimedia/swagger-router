"use strict";

// mocha defines to avoid JSHint breakage
/* global describe, it, before, beforeEach, after, afterEach */

var deepEqual = require('../utils/assert').deepEqual;
var Router = require('../../index').Router;

var specs = [
    {
        paths: {
            '/page': '/page',
            '/page/': '/page/',
            '/page/{title}': '/page/{title}',
            '/page/{title}/': '/page/{title}/',
            '/page/{title}/html': '/page/{title}/html',
            '/page/{title}/html/': '/page/{title}/html/',
            '/page/{title}/html/{revision}': '/page/{title}/html/{revision}',
            '/page/{title}/data-parsoid': '/page/{title}/data-parsoid',
            '/page/{title}/data-parsoid/': '/page/{title}/data-parsoid/',
            '/page/{title}/data-parsoid/{revision}': '/page/{title}/data-parsoid/{revision}',
            '/transform/html/to/{format}': '/transform/html/to/{format}',
            '/transform/wikitext/to/{format}': '/transform/wikitext/to/{format}',
            '/transform/': '/transform/',
            '/double/': '/double/',
            '/double//': '/double//',
            '/double//slash': '/double//slash',
            '/some/really/long/path': '/some/really/long/path',
            // Modifiers: optional path segments
            '/simple/{templated}{/path}': '/simple/{templated}{/path}',
            '/several{/optional}{/path}{+segments}': '/several{/optional}{/path}{+segments}',
            '/optional/{+path}': '/optional/{+path}'
        }
    }
];

var expectations = {
    '/en.wikipedia.org/v1/page': {
        value: '/page',
        params: {
            domain: 'en.wikipedia.org'
        },
        permissions: [],
        filters: []
    },
    '/en.wikipedia.org/v1/page/': {
        value: '/page/',
        params: {
            _ls: [],
            domain: 'en.wikipedia.org'
        },
        permissions: [],
        filters: []
    },
    '/en.wikipedia.org/v1/page/Foo': {
        value: '/page/{title}',
        params: {
            domain: 'en.wikipedia.org',
            title: 'Foo'
        },
        permissions: [],
        filters: []
    },
    // static listing of available formats
    '/en.wikipedia.org/v1/page/Foo/': {
        value: '/page/{title}/',
        params: {
            _ls: ['data-parsoid','html'],
            domain: 'en.wikipedia.org',
            title: 'Foo'
        },
        permissions: [],
        filters: []
    },
    '/en.wikipedia.org/v1/page/Foo/html': {
        value: '/page/{title}/html',
        params: {
            domain: 'en.wikipedia.org',
            title: 'Foo'
        },
        permissions: [],
        filters: []
    },
    '/en.wikipedia.org/v1/transform/html/to/wikitext': {
        value: '/transform/html/to/{format}',
        params: {
            domain: 'en.wikipedia.org',
            format: 'wikitext'
        },
        permissions: [],
        filters: []
    },
    // static listing
    '/en.wikipedia.org/v1/transform/': {
        value: '/transform/',
        params: {
            _ls: ['html','wikitext'],
            domain: 'en.wikipedia.org'
        },
        permissions: [],
        filters: []
    },
    // static listing, another wiki
    '/de.wikipedia.org/v1/transform/': {
        value: '/transform/',
        params: {
            _ls: ['html','wikitext'],
            domain: 'de.wikipedia.org'
        },
        permissions: [],
        filters: []
    },

    // double slashes
    '/en.wikipedia.org/v1/double/': {
        value: '/double/',
        params: {
            _ls: [''],
            domain: 'en.wikipedia.org'
        },
        permissions: [],
        filters: []
    },
    '/en.wikipedia.org/v1/double//': {
        value: '/double//',
        params: {
            _ls: ['slash'],
            domain: 'en.wikipedia.org'
        },
        permissions: [],
        filters: []
    },
    '/en.wikipedia.org/v1/double//slash': {
        value: '/double//slash',
        params: {
            domain: 'en.wikipedia.org'
        },
        permissions: [],
        filters: []
    },
    '/en.wikipedia.org/v1/some/really/long/path': {
        value: '/some/really/long/path',
        params: {
            domain: 'en.wikipedia.org'
        },
        permissions: [],
        filters: []
    },

    // Optional path segments
    '/en.wikipedia.org/v1/several': {
        value: '/several{/optional}{/path}{+segments}',
        params: {
            domain: 'en.wikipedia.org'
        },
        permissions: [],
        filters: []
    },
    '/en.wikipedia.org/v1/several/optional': {
        value: '/several{/optional}{/path}{+segments}',
        params: {
            domain: 'en.wikipedia.org',
            optional: 'optional'
        },
        permissions: [],
        filters: []
    },
    '/en.wikipedia.org/v1/several/optional/path': {
        value: '/several{/optional}{/path}{+segments}',
        params: {
            domain: 'en.wikipedia.org',
            optional: 'optional',
            path: 'path'
        },
        permissions: [],
        filters: []
    },
    '/en.wikipedia.org/v1/several/optional/path/segments': {
        value: '/several{/optional}{/path}{+segments}',
        params: {
            domain: 'en.wikipedia.org',
            optional: 'optional',
            path: 'path',
            segments: 'segments',
        },
        permissions: [],
        filters: []
    },
    '/en.wikipedia.org/v1/several/optional/path/segments/a': {
        value: '/several{/optional}{/path}{+segments}',
        params: {
            domain: 'en.wikipedia.org',
            optional: 'optional',
            path: 'path',
            segments: 'segments/a',
        },
        permissions: [],
        filters: []
    },
    '/en.wikipedia.org/v1/several/optional/path/segments/a/b': {
        value: '/several{/optional}{/path}{+segments}',
        params: {
            domain: 'en.wikipedia.org',
            optional: 'optional',
            path: 'path',
            segments: 'segments/a/b',
        },
        permissions: [],
        filters: []
    },
    '/en.wikipedia.org/v1/several/optional/path/a%2fb': {
        value: '/several{/optional}{/path}{+segments}',
        params: {
            domain: 'en.wikipedia.org',
            optional: 'optional',
            path: 'path',
            segments: 'a%2Fb',
        },
        permissions: [],
        filters: []
    },
    '/en.wikipedia.org/v1/several/optional/path/segments/a%2fb': {
        value: '/several{/optional}{/path}{+segments}',
        params: {
            domain: 'en.wikipedia.org',
            optional: 'optional',
            path: 'path',
            segments: 'segments/a%2Fb',
        },
        permissions: [],
        filters: []
    },
    '/en.wikipedia.org/v1/simple/templated': {
        value: '/simple/{templated}{/path}',
        params: {
            domain: 'en.wikipedia.org',
            templated: 'templated'
        },
        permissions: [],
        filters: []
    },
    '/en.wikipedia.org/v1/simple/templated/path': {
        value: '/simple/{templated}{/path}',
        params: {
            domain: 'en.wikipedia.org',
            templated: 'templated',
            path: 'path'
        },
        permissions: [],
        filters: []
    },
    '/en.wikipedia.org/v1/simple/templated/path/toolong': null,

    '/en.wikipedia.org/v1/optional': {
        params: {
            domain: 'en.wikipedia.org'
        },
        value: null,
        permissions: [],
        filters: []
    },
    '/en.wikipedia.org/v1/optional/': {
        params: {
            domain: 'en.wikipedia.org',
            _ls: []
        },
        value: null,
        permissions: [],
        filters: []
    },
    '/en.wikipedia.org/v1/optional/path': {
        value: '/optional/{+path}',
        params: {
            domain: 'en.wikipedia.org',
            path: 'path'
        },
        permissions: [],
        filters: []
    },
    '/en.wikipedia.org/v1/optional/path/bits': {
        value: '/optional/{+path}',
        params: {
            domain: 'en.wikipedia.org',
            path: 'path/bits'
        },
        permissions: [],
        filters: []
    },

    // A few paths that should not match
    '/en.wikipedia.org/v1/pages': null,
    '/en.wikipedia.org/v1/pages/': null,
    '/de.wikipedia.org/v1/pages/': null,
    '/en.wikipedia.org/v1//': null
};


function makeFullSpec () {
    var domains = ['en.wikipedia.org', 'de.wikipedia.org', 'fr.wikipedia.org', 'es.wikipedia.org'];

    function addPrefixedPaths(newPaths, prefix, paths) {
        var newSpec = {};
        for (var path in paths) {
            newPaths[prefix + path] = paths[path];
        }
    }

    var fullPaths = {};
    specs.forEach(function(spec) {
        domains.forEach(function(domain) {
            addPrefixedPaths(fullPaths, '/{domain:' + domain + '}/v1', spec.paths);
        });
    });

    return {
        paths: fullPaths
    };
}

var router = new Router();
var fullSpec = makeFullSpec();
var tree = router.specToTree(fullSpec);
router.setTree(tree);

describe('Set of lookups', function() {

    Object.keys(expectations).forEach(function(key) {
        var val = expectations[key];
        it('match: ' + JSON.stringify(key), function() {
            deepEqual(router.lookup(key), val);
        });
    });
});

router.setTree(tree.clone());
describe('Repeat on cloned tree', function() {

    Object.keys(expectations).forEach(function(key) {
        var val = expectations[key];
        it('match: ' + JSON.stringify(key), function() {
            deepEqual(router.lookup(key), val);
        });
    });
});
