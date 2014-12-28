# Swagger 2 router
[![Build
Status](https://travis-ci.org/gwicke/swagger-router.svg?branch=master)](https://travis-ci.org/gwicke/swagger-router)

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
