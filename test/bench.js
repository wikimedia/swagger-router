"use strict";

var URI = require('../index').URI;
var Template = require('../index').Template;

function simple() {
    var requestTemplate = new Template({
        uri: '/{domain}/a/{b}/{c}{/d}'
    });

    var n = 1000000;
    var start = Date.now();
    for (var i = 0; i < n; i++) {
        var uri = new URI(requestTemplate.expand({
            request: {
                params: {
                    domain: 'en.wikipedia.org',
                    b: 'foobar',
                    c: 'baaz',
                    d: 'ddeeee'
                }
            }
        }).uri);
    }
    console.log((Date.now() - start) / n, 'ms per iteration');
}
simple();

