# Some ideas for improvements

## Simple URI templating
Use parsePattern for simple URI templating, especially for internal requests:

```javascript
var router = require('swagger-router');

var uri = new router.URI('/{domain}/v1/page/{title}');

// Optionally, bind variables at the same time
uri = new router.URI('/{domain}/v1/page/{title}', {
          domain: 'en.wikipedia.org',
          title: 'Foo'
      });

// Re-bind some or all free variables in the path
var boundURI = new router.URI(uri, { title: 'Bar' });

// Asking for the string will join & escape the URL
var uriStr = boundURI.toString();
// -> '/en.wikipedia.org/v1/Bar'
```
