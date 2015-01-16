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
            '/some/really/long/path': '/some/really/long/path'
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
        var uri = new URI('/{domain:some}/path/to/something');
        uri = new URI(uri);
        uri.bind({domain: 'foo/bar'});
        deepEqual(uri.toString(), '/foo%2Fbar/path/to/something');
    });

    it('{/patterns} empty', function() {
        var uri = new URI('/{domain:some}/path/to{/optionalPath}');
        uri = new URI(uri);
        uri.bind({domain: 'foo'});
        deepEqual(uri.toString(), '/foo/path/to');
    });

    it('{/patterns} bound', function() {
        var uri = new URI('/{domain:some}/path/to{/optionalPath}');
        uri = new URI(uri);
        uri.bind({optionalPath: 'foo'});
        deepEqual(uri.toString(), '/some/path/to/foo');
    });

    it('{+patterns} empty', function() {
        var uri = new URI('/{domain:some}/path/to/{+rest}');
        deepEqual(uri.toString(), '/some/path/to/');
    });

    it('{+patterns} bound', function() {
        var uri = new URI('/{domain:some}/path/to/{+rest}');
        uri.bind({rest: 'foo'});
        deepEqual(uri.toString(), '/some/path/to/foo');
    });

    it('decoding / encoding', function() {
        var uri = new URI('/{domain:some}/a%2Fb/to/100%/%FF', {domain: 'foo/bar'});
        // Note how the invalid % encoding is fixed up to %25
        deepEqual(uri.toString(), '/foo%2Fbar/a%2Fb/to/100%25/%25FF');
    });

    it('construct from array', function() {
        var uri = new URI(['{domain:some}','a/b', 'to', '100%'], {domain: 'foo/bar'});
        // Note how the invalid % encoding is fixed up to %25
        deepEqual(uri.toString(), '/foo%2Fbar/a%2Fb/to/100%25');
        // Try once more for caching
        deepEqual(uri.toString(), '/foo%2Fbar/a%2Fb/to/100%25');
    });

    it('append a suffix path', function() {
        var uri = new URI('/{domain:test.com}/v1');
        uri.pushSuffix('/page/{title}');
        uri.bind({title: 'foo'});
        deepEqual(uri.toString(), '/test.com/v1/page/foo');
    });

    it('remove a suffix path', function() {
        var uri = new URI('/{domain:test.com}/v1/page/{title}');
        uri.popSuffix('/page/{title}');
        deepEqual(uri.toString(), '/test.com/v1');
    });

    it('check for a prefix path', function() {
        var uri = new URI('/{domain:test.com}/v1/page/{title}');
        deepEqual(uri.startsWith('/test.com/v1/page'), true);
    });
    
    it('params', function() {
        var uri = new URI('/{domain:test.com}/v1/page/{title}');
        uri.bind({title: 'Foo'});
        deepEqual(uri.params, {domain: 'test.com', title: 'Foo'});
    });
    
    it('params after pushSuffix()', function() {
        var uri = new URI('/{domain:test.com}/v1/page/{title}');
        uri.pushSuffix(new URI('/{format:html}'));
        uri.bind({title: 'Foo'});
        deepEqual(uri.params, {domain: 'test.com', title: 'Foo', format: 'html'});
    });
    
    it('params after popSuffix()', function() {
        var uri = new URI('/{domain:test.com}/v1/page/{title}/{format:html}');
        uri.popSuffix('/html');
        uri.bind({title: 'Foo'});
        deepEqual(uri.params, {domain: 'test.com', title: 'Foo'});
    });
    
});
