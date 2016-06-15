"use strict";

// mocha defines to avoid JSHint breakage
/* global describe, it, before, beforeEach, after, afterEach */

var deepEqual = require('../utils/assert').deepEqual;
var URI = require('../../index').URI;

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

    it('{+patterns} dynamic expand with array', function() {
        var uri = new URI('/{domain:some}/path/to/{+rest}',{}, true);
        deepEqual(uri.expand({rest: ['foo', 'bar']}).toString(), '/some/path/to/foo,bar');
    });

    it('{+patterns} dynamic expand with subpath', function() {
        var uri = new URI('/{domain:some}/path/to/{+rest}',{}, true);
        deepEqual(uri.expand({rest: 'foo/bar'}).toString(), '/some/path/to/foo/bar');
    });

    it('{+patterns} dynamic expand with reserved chars', function() {
        var uri = new URI('/{domain:some}/path/to/{+rest}',{}, true);
        deepEqual(uri.expand({rest: 'foo$bar/bar?test#a=$'}).toString(), '/some/path/to/foo$bar/bar?test#a=$');
    });

    it('{+patterns} dynamic expand with %2F', function() {
        var uri = new URI('/{domain:some}/path/to/{+rest}',{}, true);
        deepEqual(uri.expand({rest: 'foo%2Fbar'}).toString(), '/some/path/to/foo%2Fbar');
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
        var uri = new URI(baseURI.path.concat(suffix.path), {title: 'foo'}, true);
        deepEqual(uri.toString(), '/test.com/v1/page/foo', {}, true);
        deepEqual(uri.expand().path, ['test.com', 'v1', 'page', 'foo']);
    });

    it('remove a suffix path', function() {
        var basePath = new URI('/{domain:test.com}/v1/page/{title}', {}, true).path;
        var uri = new URI(basePath.slice(0, basePath.length - 2), {}, true);
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
