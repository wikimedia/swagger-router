# Swagger 2 router
[![Build
Status](https://travis-ci.org/wikimedia/swagger-router.svg?branch=master)](https://travis-ci.org/wikimedia/swagger-router)

## Features
- `O(path element)` lookup complexity, monomorphic design with simple fast path.
- Support for prefix-based 'mounting' of swagger specs. Example: Mount the
    same spec fragments at `/en.wikipedia.org/v1/` and
    `/de.wikipedia.org/v1/`.
- Support for capture of fixed path segments. Example:
    `/{domain:en.wikipedia.org}/v1/`. This feature is especially useful in
    prefixes, as it enables the consistent construction of sensible params.
- Support for static (purely spec-based) listings. Matching requests ending on
    a slash are passed an array of matching child paths in the spec in the
    `_ls` parameter.

## Installation
`npm install swagger-router`

## Usage
```javascript
var Router = require('swagger-router');
var router = new Router();

// The main requirement is that each spec has a 'paths' member with some URL
// patterns
var swaggerSpec = {
    paths: {
        '/': {
            get: {
                hello: 'A listing'
            }
        },
        '/some/{name}': { // This object is returned as 'value'
            get: {
                hello: 'world'
            }
        }
    }
};

router.addSpec(swaggerSpec);

// Perform some lookups
console.log(router.lookup('/some/title'));
/* 
{
    params: {
        name: 'title'
    },
    value: { get: { hello: 'world' } }
}
*/

// Use arrays internally for speed (no escaping / parsing)
router.lookup(['some','path']);

// Trailing slashes set an additional _ls param:
router.lookup(['']); // equivalent: router.lookup('/'); 
/*
{
    params: {
        _ls: ['some'],
        name: 'title'
    },
    value: { get: { hello: 'A listing' } }
}
*/

```
## URI templating

URIs are represented by `URI` class, which supports a limited set of features
from [URI Template RFC 6570](http://tools.ietf.org/html/rfc6570). 

### Supported URI template expressions:
- Simple string expression `{pattern}` - on expansion, looks up a variable named `pattern` in params
  and substitutes its pct-encoded value. On matching, matches a single element in the path, and
  sets `params.pattern` to the path element value. 
- Restricted expression `{+pattern}` - on expansion, works the same way as simple expression, but doesn't
  pct-encode [reserved characters](http://tools.ietf.org/html/rfc3986#section-2.2) and ptc-triplets.
  On matching, matches the whole subpath and writes it's value to `params.pattern` variable.
- Optional expression `{/pattern}` - works the same way as simple expression, but on matching the path 
  element is optional.
- Fixed expression `{pattern:value}` - on matching, matches only uris with path element equal to `value`,
  and exports `value` as `params.pattern` variable. On expansion, substitutes `value`.

These features are optimised and available with `URI.expand(params)` method. Additional features
are available with request templating.

## Request templating

Module exports an efficient templating library under `Template` class.

Example usage:
```javascript
var template = new Template({
    method: 'put',
    uri: '/{domain}/{$.request.headers.location}',
    headers: '{$$.merge($.request.headers, {"additional_name": "additional_value"})}'
    body: {
        field_from_req_body: '{field_name}',
        global_reference: '{$.request.headers.header_name}',
        field_with_default_value: '{$$.default($.request.params.param_name, "defaultValue")}'       
    }
});
var request = template.expand({
    request: req,
    additional_context: context
});
```

Expressions wrapped in curly braces are considered templates, which are resolved to values
on template expansion. In case some value cannot be resolved, template is expanded to `undefined`.

`$` references global context (object, passed to the `expand` method). It can contain arbitrary number of objects,
but it must at least contain a `request` property with an original request. 

Short notations are supported, which are resolved to fields of a request part, for example, 
`'{field_name}'` in template `body` would be resolved to `'{$.request.body.field_name}'`. 
Short notations in `uri` would be resolved to `$.request.params`.

Braced syntax is supported, so it's possible to write templates like `'{$.request.body[$.request.params.some_field]}'`.

Several utility methods are supported:
- `$$.default(template, defaultValue)` - if `template` is resolved, use it's value, otherwise use `defaultValue`.
- `$$.merge(template1, template2)` - both templates should be evaluated to objects. The result is an object
   with merged properties, but without overriding.
- `$$.strip(object, properties)` - removes field names listed in `properties` array from an `object`. `properties`
   could also be a string, if a single field should be removed.
