# filru

A disk based LRU cache. Nothing is kept in memory.

It was initially intended to be a simplistic caching layer for frequent HTTP requests.

Since the underlying OS file system caching is much faster than doing a network request.  

## Usage

Node.js >= version 6

```
npm install filru
```


```javascript
const Filru = require('filru');
const handleErr = (err) => {
  throw err;
};

const maxBytes = 50 * 1024 * 1024; // 50 megabytes
const f = new Filru('/tmp/filru', maxBytes);

// optionally add a load function
f.load = function customLoad(key) {
  // custom async load function must return a promise
  return Promise.resolve();
};

f.start();

f.set('jimmy.txt', 'yo').catch(handleErr);
f.get('jimmy.txt')
    .then((buffer) => {
      console.log('got jimmy:', buffer.toString('utf8')); // "yo"
    })
    .catch(handleErr);

f.stop();
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
