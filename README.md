# filru &nbsp;&nbsp; [![Build Status](https://travis-ci.org/ruffrey/filru.svg?branch=master)](https://travis-ci.org/ruffrey/filru)

A pure-disk based least-recently-used (LRU) cache.

Nothing is kept in memory. This has the benefit of persisting across application restarts,
and not taking up any RAM.

The cache is constrained by size (bytes), and optionally by file age.

## Use Cases

filru is much slower than an in-memory cache, so use cases are:

- a simplistic caching layer for frequent HTTP requests, since OS file system caching is much
faster than doing a network request
- caching the results of CPU-intensive operations
- caching slow operations across multiple network requests
- caching large items

## Usage

Node.js >= version 6

```
npm install filru
```


```javascript
const Filru = require('filru');
const require('request-promise-native'); // optional for loading async when not in cache
const handleErr = (err) => {
  throw err;
};

const maxBytes = 50 * 1024 * 1024; // 50 megabytes
const maxAge = 24 * 60 * 60 * 1000; // 1 day
const hashSeed = 'cache4gold'; // optional, random seed string
const pruneInterval = 1000 * 60 * 60; // optional, defaults to 1 hour
const f = new Filru({ dir: '/tmp/filru', maxBytes, maxAge, hashSeed, pruneInterval });

// optionally add a load function for when an object
// is not found in the cache
f.load = function customLoad(key) {
  // Custom async load function must return a promise.
  return request.get('https://my-site.com/' + key);
};

f.start()
  .then(() => {
    // fill the cache
    f.set('jimmy.txt', 'yo').catch(handleErr);
    f.get('jimmy.txt')
        .then((buffer) => {
          console.log('got jimmy:', buffer.toString('utf8')); // "yo"
        })
        .catch(handleErr);
    // stop cleanup job
    f.stop();
  })
  .catch(err => {
    throw err;
  });
```

## Tests

```
npm test
```

## Debugging

Run your application with `DEBUG=filru*`

## License

MIT

See LICENSE file in the root of this directory.
