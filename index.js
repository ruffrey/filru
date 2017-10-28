const fs = require('fs');
const mkdirp = require('mkdirp');
const XXH = require('xxhashjs');
const debug = require('debug')('filru');

const PRUNE_INTERVAL_MS = 60 * 1000;
const HASH_SEED = 0xABCD;

class Filru {
  constructor(dir, maxBytes, loadFunc) {
    if (!dir || typeof dir !== 'string') {
      throw new TypeError('filru: dir is invalid');
    }
    if (!maxBytes || typeof maxBytes !== 'number' || maxBytes < 1) {
      throw new TypeError('filru: maxBytes must be a number greater than 0');
    }
    this.dir = dir;
    this.maxBytes = maxBytes;
    this.stopped = false;
    this.load = loadFunc;

    this._timeout = null;
  }

  static hash(key) {
    return XXH.h64(key, HASH_SEED).toString(16);
  }

  /**
   * @return {Promise}
   */
  start() {
    this.stopped = false;
    return new Promise((resolve, reject) => {
      mkdirp(this.dir, (err) => {
        if (err) {
          reject(err);
          return;
        }
        this.run();
        resolve();
      });
    });
  }

  stop() {
    this.stopped = true;
    if (this._timeout) {
      clearTimeout(this._timeout);
      this._timeout = null;
    }
  }

  get(key) {
    const h = Filru.hash(key);
    const fullpath = this.dir + '/' + h;
    return new Promise((resolve, reject) => {
      fs.readFile(fullpath, (err, buffer) => {
        if (err) {
          if (err.code === 'ENOENT' && this.load) {
            debug('get soft fail, will load:', { key, fullpath });
            return this.load(key);
          }
          debug('get fail', { key, fullpath, err });
          reject(err);
          return;
        }
        this.touch(key);
        resolve(buffer);
      });
    });
  }

  set(key, contents) {
    const h = Filru.hash(key);
    const fullpath = this.dir + '/' + h;
    return new Promise((resolve, reject) => {
      fs.writeFile(fullpath, contents, (err) => {
        if (err) {
          debug('set fail', { key, fullpath, err });
          reject(err);
          return;
        }
        resolve(Buffer.from(contents));
      });
    });
  }

  touch(key) {
    const h = Filru.hash(key);
    const fullpath = this.dir + '/' + h;
    const newTime = new Date();
    fs.utimes(fullpath, newTime, newTime, (err) => {
      if (err) {
        debug('touch failed', { fullpath, err });
      }
    });
  }

  /**
   * @param key
   * @return {Promise}
   */
  del(key) {
    const h = Filru.hash(key);
    return this._unlink(this.dir + '/' + h);
  }

  _unlink(fullpath) {
    return new Promise((resolve, reject) => {
      fs.unlink(fullpath, (err) => {
        if (err) {
          debug('delete failed', { fullpath, err });
          reject(err);
          return;
        }
        debug('delete ok', { fullpath });
        resolve();
      });
    });
  }

  run() {
    const runNext = () => {
      if (!this.stopped) {
        this._timeout = setTimeout(() => this.run(), PRUNE_INTERVAL_MS);
      }
    };
    return new Promise((resolve, reject) => {
      fs.readdir(this.dir, (err, files) => {
        if (err) {
          resolve(err);
          return;
        }

        statAllAndSort(this.dir, files)
          .then((filesSorted) => {
            const totalFiles = filesSorted.length;
            const deletions = [];
            let sizeUpTo = 0;
            let file = null;
            let i = 0;
            for (; i < totalFiles; i++) {
              file = filesSorted[i];
              sizeUpTo += file.size;
              debug(sizeUpTo, file, this.maxBytes, sizeUpTo > this.maxBytes);
              if (sizeUpTo > this.maxBytes) {
                // delete the remaining files
                debug('scheduling removal', { file });
                deletions.push(this._unlink(file.name));
              }
            }
            debug('run will delete', deletions.length, { totalSize: sizeUpTo, maxBytes: this.maxBytes });
            return Promise.all(deletions);
          })
          .then(runNext)
          .catch((err) => {
            debug('run failed', err);
            runNext();
          });
      });
    });
  }
}

module.exports = Filru;

/**
 * Return list of file stats in order of newest files first.
 *
 * @param {string} dir
 * @param {Array}<string> files - array of filenames relative to the directory
 * @return {Promise<Array<FilruStat>}
 */
function statAllAndSort(dir, files) {
  const fullPaths = files.map(filename => dir + '/' + filename);
  return forEachPromise(fullPaths, doStat)
    .then((allStats) => {
      allStats.sort((a, b) =>
        (b.time - a.time));
      debug('statAllAndSort:', allStats.length, 'files sorted');
      return allStats;
    });
}

/**
 * @param {string} fullpath
 * @return {Promise<FilruStat>}
 */
function doStat(fullpath) {
  return new Promise((resolve) => {
    fs.stat(fullpath, (err, stats) => {
      if (err) {
        // ignore file not stat
        debug('stat failed, will remove soon', { err, fullpath });
      }
      let time = 0; // if stat failed, will try to remove due to being old
      let size = 0;
      if (stats) {
        time = stats.mtime.getTime();
        size = stats.size;
      }
      const fileStats = new FilruStat(fullpath, time, size);
      resolve(fileStats);
    });
  });
}

class FilruStat {
  constructor(name, time, size) {
    this.name = name;
    this.time = time;
    this.size = size;
  }
}

function forEachPromise(items, fn) {
  const results = [];
  return items.reduce((promise, item) => {
    return promise.then((result) => {
      if (result) {
        results.push(result);
      }
      return fn(item);
    });
  }, Promise.resolve())
    .then(() => results);
}
