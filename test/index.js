'use strict';

// Run jshint as part of normal testing
require('mocha-jshint')();

// mocha defines to avoid JSHint breakage
/* global describe, it, before, beforeEach, after, afterEach */
var deepEqual = require('assert').deepEqual;
var Router = require('../index');

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
            '/double//slash': '/double//slash'
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

    // A few paths that should not match
    '/en.wikipedia.org/v1/pages': null,
    '/en.wikipedia.org/v1/pages/': null,
    '/de.wikipedia.org/v1/pages/': null,
    '/en.wikipedia.org/v1//': null
};

var domains = ['en.wikipedia.org','de.wikipedia.org'];

var router = new Router();
specs.forEach(function(spec) {
    domains.forEach(function(domain) {
        router.addSpec(spec, '/{domain:' + domain + '}/v1');
    });
});

describe('swagger-router', function() {

    Object.keys(expectations).forEach(function(key) {
        var val = expectations[key];
        it('match: ' + JSON.stringify(key), function() {
            deepEqual(router.lookup(key), val);
        });
    });
});

