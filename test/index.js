'use strict';

// Run jshint as part of normal testing
require('mocha-jshint')();

// mocha defines to avoid JSHint breakage
/* global describe, it, before, beforeEach, after, afterEach */
var deepEqual = require('assert').deepEqual;
var swaggerRouter = require('../index');
var Router = swaggerRouter.Router;
var URI = swaggerRouter.URI;

function listingHandler (list) { return list; }

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
        }
    },
    '/en.wikipedia.org/v1/page/': {
        value: '/page/',
        params: {
            _ls: [],
            domain: 'en.wikipedia.org'
        }
    },
    '/en.wikipedia.org/v1/page/Foo': {
        value: '/page/{title}',
        params: {
            domain: 'en.wikipedia.org',
            title: 'Foo'
        }
    },
    // static listing of available formats
    '/en.wikipedia.org/v1/page/Foo/': {
        value: '/page/{title}/',
        params: {
            _ls: ['data-parsoid','html'],
            domain: 'en.wikipedia.org',
            title: 'Foo'
        }
    },
    '/en.wikipedia.org/v1/page/Foo/html': {
        value: '/page/{title}/html',
        params: {
            domain: 'en.wikipedia.org',
            title: 'Foo'
        }
    },
    '/en.wikipedia.org/v1/transform/html/to/wikitext': {
        value: '/transform/html/to/{format}',
        params: {
            domain: 'en.wikipedia.org',
            format: 'wikitext'
        }
    },
    // static listing
    '/en.wikipedia.org/v1/transform/': {
        value: '/transform/',
        params: {
            _ls: ['html','wikitext'],
            domain: 'en.wikipedia.org'
        }
    },
    // static listing, another wiki
    '/de.wikipedia.org/v1/transform/': {
        value: '/transform/',
        params: {
            _ls: ['html','wikitext'],
            domain: 'de.wikipedia.org'
        }
    },

    // double slashes
    '/en.wikipedia.org/v1/double/': {
        value: '/double/',
        params: {
            _ls: [''],
            domain: 'en.wikipedia.org'
        }
    },
    '/en.wikipedia.org/v1/double//': {
        value: '/double//',
        params: {
            _ls: ['slash'],
            domain: 'en.wikipedia.org'
        }
    },
    '/en.wikipedia.org/v1/double//slash': {
        value: '/double//slash',
        params: {
            domain: 'en.wikipedia.org'
        }
    },
    '/en.wikipedia.org/v1/some/really/long/path': {
        value: '/some/really/long/path',
        params: {
            domain: 'en.wikipedia.org'
        }
    },

    // Optional path segments
    '/en.wikipedia.org/v1/several': {
        value: '/several{/optional}{/path}{+segments}',
        params: {
            domain: 'en.wikipedia.org'
        }
    },
    '/en.wikipedia.org/v1/several/optional': {
        value: '/several{/optional}{/path}{+segments}',
        params: {
            domain: 'en.wikipedia.org',
            optional: 'optional'
        }
    },
    '/en.wikipedia.org/v1/several/optional/path': {
        value: '/several{/optional}{/path}{+segments}',
        params: {
            domain: 'en.wikipedia.org',
            optional: 'optional',
            path: 'path'
        }
    },
    '/en.wikipedia.org/v1/several/optional/path/segments': {
        value: '/several{/optional}{/path}{+segments}',
        params: {
            domain: 'en.wikipedia.org',
            optional: 'optional',
            path: 'path',
            segments: ['segments'],
        }
    },
    '/en.wikipedia.org/v1/several/optional/path/segments/a': {
        value: '/several{/optional}{/path}{+segments}',
        params: {
            domain: 'en.wikipedia.org',
            optional: 'optional',
            path: 'path',
            segments: ['segments','a'],
        }
    },
    '/en.wikipedia.org/v1/several/optional/path/segments/a/b': {
        value: '/several{/optional}{/path}{+segments}',
        params: {
            domain: 'en.wikipedia.org',
            optional: 'optional',
            path: 'path',
            segments: ['segments','a','b'],
        }
    },
    '/en.wikipedia.org/v1/simple/templated': {
        value: '/simple/{templated}{/path}',
        params: {
            domain: 'en.wikipedia.org',
            templated: 'templated'
        }
    },
    '/en.wikipedia.org/v1/simple/templated/path': {
        value: '/simple/{templated}{/path}',
        params: {
            domain: 'en.wikipedia.org',
            templated: 'templated',
            path: 'path'
        }
    },
    '/en.wikipedia.org/v1/simple/templated/path/toolong': null,

    '/en.wikipedia.org/v1/optional': {
        params: {
            domain: 'en.wikipedia.org'
        },
        value: null
    },
    '/en.wikipedia.org/v1/optional/': {
        params: {
            domain: 'en.wikipedia.org',
            _ls: []
        },
        value: null
    },
    '/en.wikipedia.org/v1/optional/path': {
        value: '/optional/{+path}',
        params: {
            domain: 'en.wikipedia.org',
            path: ['path']
        }
    },
    '/en.wikipedia.org/v1/optional/path/bits': {
        value: '/optional/{+path}',
        params: {
            domain: 'en.wikipedia.org',
            path: ['path','bits']
        }
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

describe('URI', function() {
    it('to URI and back', function() {
        var uri = new URI('/{domain:some}/path/to/something', {}, true);
        uri = new URI(uri, {domain: 'foo/bar'});
        deepEqual(uri.toString(), '/foo%2Fbar/path/to/something');
        deepEqual(uri.expand().path, ['foo/bar','path','to','something']);
    });

    it('to URI and back, no pattern', function() {
        var uri = new URI('/{domain:some}/path/to/something', {domain: 'foo'});
        deepEqual(uri.toString(), '/%7Bdomain%3Asome%7D/path/to/something');
        deepEqual(uri.expand().path, ['{domain:some}','path','to','something']);
    });

    it('{/patterns} empty', function() {
        var uri = new URI('/{domain:some}/path/to{/optionalPath}', {}, true);
        uri = new URI(uri, {domain: 'foo'});
        deepEqual(uri.toString(), '/foo/path/to');
    });

    it('{/patterns} bound', function() {
        var uri = new URI('/{domain:some}/path/to{/optionalPath}', {}, true);
        uri.params = {optionalPath: 'foo'};
        deepEqual(uri.toString(), '/some/path/to/foo');
    });

    it('{/patterns} dynamic expand', function() {
        var uri = new URI('/{domain:some}/path/to{/optionalPath}', {}, true);
        deepEqual(uri.expand({optionalPath: 'foo'}).toString(), '/some/path/to/foo');
    });

    it('{+patterns} empty', function() {
        var uri = new URI('/{domain:some}/path/to/{+rest}', {}, true);
        deepEqual(uri.toString(), '/some/path/to/');
    });

    it('{+patterns} bound', function() {
        var uri = new URI('/{domain:some}/path/to/{+rest}',
                {rest: 'foo'}, true);
        deepEqual(uri.toString(), '/some/path/to/foo');
    });

    it('{+patterns} dynamic expand', function() {
        var uri = new URI('/{domain:some}/path/to/{+rest}',{}, true);
        deepEqual(uri.expand({rest: 'foo'}).toString(), '/some/path/to/foo');
    });

    it('decoding / encoding', function() {
        var uri = new URI('/{domain:some}/a%2Fb/to/100%/%FF', {domain: 'foo/bar'}, true);
        // Note how the invalid % encoding is fixed up to %25
        deepEqual(uri.toString(), '/foo%2Fbar/a%2Fb/to/100%25/%25FF');
    });

    it('construct from array', function() {
        var uri = new URI([{
            name: 'domain',
            pattern: 'some'
        },'a/b', 'to', '100%'], {domain: 'foo/bar'}, true);
        // Note how the invalid % encoding is fixed up to %25
        deepEqual(uri.toString(), '/foo%2Fbar/a%2Fb/to/100%25');
        // Try once more for caching
        deepEqual(uri.toString(), '/foo%2Fbar/a%2Fb/to/100%25');
    });

    it('append a suffix path', function() {
        var baseURI = new URI('/{domain:test.com}/v1', {}, true);
        var suffix = new URI('/page/{title}', {}, true);
        var uri = new URI(baseURI.path.concat(suffix.path), {title: 'foo'});
        deepEqual(uri.toString(), '/test.com/v1/page/foo', {}, true);
        deepEqual(uri.expand().path, ['test.com', 'v1', 'page', 'foo']);
    });

    it('remove a suffix path', function() {
        var basePath = new URI('/{domain:test.com}/v1/page/{title}', {}, true).path;
        var uri = new URI(basePath.slice(0, basePath.length - 2));
        deepEqual(uri.toString(), '/test.com/v1');
    });

    it('should serialize with "simplePattern" and "fullPattern" formats', function() {
        var uri = new URI('/{domain:test.com}/v1/{title}{/foo}{+bar}', {}, true);
        deepEqual(uri.toString(), '/test.com/v1');
        deepEqual(uri.toString('simplePattern'), '/test.com/v1/{title}{/foo}{+bar}');
        deepEqual(uri.toString('fullPattern'), '/{domain:test.com}/v1/{title}{/foo}{+bar}');
    });

    it('check for a prefix path', function() {
        var uri = new URI('/{domain:test.com}/v1/page/{title}', {}, true);
        deepEqual(uri.startsWith('/test.com/v1/page'), true);
    });

    it('handle protocols', function() {
        var uri = new URI('https://test.com/v1/page/title');
        deepEqual(uri.urlObj.protocol, 'https:');
        deepEqual(uri.path[0], 'v1');
        deepEqual(uri.toString(), 'https://test.com/v1/page/title');
    });

    it('handle protocols & patterns', function() {
        var uri = new URI('https://test.com/v1/page/{title}',
                {title: 'testTitle'}, true);
        deepEqual(uri.startsWith('/v1/page'), true);
        deepEqual(uri.toString(), 'https://test.com/v1/page/testTitle');
    });
});
