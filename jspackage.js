// Generated by CoffeeScript 1.3.3
var async, cached_files, collectDependencies, compile, extensions, fs, libs, options, parseFile, path, resolveDepend, resolveDependencyChain, root, watchFile, watchFileFallback, watchFiles;

fs = require('fs');

path = require('path');

async = require('async');

cached_files = {};

root = null;

options = null;

parseFile = function(full_path, cb) {
  var file;
  file = {
    path: full_path,
    compiled_js: null,
    mtime: null,
    deps: []
  };
  return fs.stat(full_path, function(err, stat) {
    if (err) {
      cb(err);
      return;
    }
    file.mtime = +stat.mtime;
    return fs.readFile(full_path, 'utf8', function(err, source) {
      var depend_string, parser, re, result, timestamp;
      if (err) {
        cb(err);
        return;
      }
      parser = extensions[path.extname(full_path)];
      try {
        file.compiled_js = parser.compile(source);
      } catch (err) {
        cb("" + full_path + "\n" + err, file);
        return;
      }
      if (options.watch) {
        timestamp = (new Date()).toLocaleTimeString();
        console.info("" + timestamp + " - compiled " + file.path);
      }
      re = parser.depend_re;
      re.lastIndex = 0;
      while (result = re.exec(source)) {
        depend_string = result[1].slice(1, -1);
        file.deps.push(depend_string);
      }
      return cb(null, file);
    });
  });
};

resolveDepend = function(cwd, depend_string, doneResolvingDepend) {
  var lib_index, tryNextLib, try_exts;
  try_exts = Object.keys(extensions);
  lib_index = 0;
  tryNextLib = function() {
    var resolveWithExt, try_lib;
    if ((try_lib = libs[lib_index++]) != null) {
      resolveWithExt = function(ext, cb) {
        var resolved_path;
        resolved_path = path.resolve(cwd, try_lib, depend_string + ext);
        return fs.realpath(resolved_path, function(err, real_path) {
          if (err) {
            cb(null, null);
            return;
          }
          return fs.stat(real_path, function(err, stat) {
            if (err || stat.isDirectory()) {
              return cb(null, null);
            } else {
              return cb(null, real_path);
            }
          });
        });
      };
      return async.map(try_exts, resolveWithExt, function(err, results) {
        return async.filter(results, (function(item, cb) {
          return cb(item != null);
        }), function(results) {
          if (results.length === 1) {
            doneResolvingDepend(null, results[0]);
          } else if (results.length === 0) {
            tryNextLib();
          } else if (results.length > 1) {
            doneResolvingDepend("ambiguous dependency: " + depend_string);
          }
        });
      });
    } else {
      return doneResolvingDepend("unable to resolve dependency: " + depend_string);
    }
  };
  return tryNextLib();
};

resolveDependencyChain = function(root, doneResolvingDependencyChain) {
  var deps, processNode, seen;
  deps = [];
  seen = {};
  processNode = function(node, doneProcessingNode) {
    var resolveFromDep;
    resolveFromDep = function(dep, cb) {
      return resolveDepend(path.dirname(node.path), dep, cb);
    };
    return async.map(node.deps, resolveFromDep, function(err, resolved_deps) {
      var dep, dep_path, funcs, _i, _len;
      if (err) {
        doneResolvingDependencyChain(err);
        return;
      }
      funcs = [];
      for (_i = 0, _len = resolved_deps.length; _i < _len; _i++) {
        dep_path = resolved_deps[_i];
        dep = cached_files[dep_path];
        if (seen[dep.path] != null) {
          continue;
        }
        seen[dep.path] = true;
        funcs.push(async.apply(processNode, dep));
      }
      return async.parallel(funcs, function(err, results) {
        if (err) {
          doneResolvingDependencyChain(err);
          return;
        }
        deps.push(node);
        return doneProcessingNode();
      });
    });
  };
  return processNode(root, function() {
    return doneResolvingDependencyChain(null, deps);
  });
};

collectDependencies = function(cwd, depend_string, doneCollectingDependencies) {
  return resolveDepend(cwd, depend_string, function(err, canonical_path) {
    var cached_file, callNext, parseAndHandleErr;
    if (err) {
      doneCollectingDependencies(err);
      return;
    }
    parseAndHandleErr = function(cb) {
      return parseFile(canonical_path, function(err, file) {
        if (file) {
          cached_files[file.path] = file;
          if (root == null) {
            root = file;
          }
        }
        if (err) {
          doneCollectingDependencies(err);
        } else {
          cb(file);
        }
      });
    };
    callNext = function(file) {
      var collectFromFile;
      collectFromFile = function(dep, cb) {
        return collectDependencies(path.dirname(file.path), dep, cb);
      };
      return async.map(file.deps, collectFromFile, doneCollectingDependencies);
    };
    if ((cached_file = cached_files[canonical_path]) != null) {
      return fs.stat(canonical_path, function(err, stat) {
        if (cached_file.mtime === +stat.mtime) {
          if (root == null) {
            root = cached_file;
          }
          return callNext(cached_file);
        } else {
          return parseAndHandleErr(callNext);
        }
      });
    } else {
      return parseAndHandleErr(callNext);
    }
  });
};

watchFileFallback = function(filename, options, cb) {
  options.interval = 701;
  fs.watchFile(filename, options, function(curr, prev) {
    if (curr.mtime !== prev.mtime) {
      return cb("change", filename);
    }
  });
  return {
    close: function() {
      return fs.unwatchFile(filename);
    }
  };
};

watchFile = fs.watch || watchFileFallback;

watchFiles = function(files, cb) {
  var doCallback, file, watcher, watchers, _i, _len, _results;
  watchers = [];
  doCallback = function(event) {
    var watcher, _i, _len;
    if (event === "change") {
      for (_i = 0, _len = watchers.length; _i < _len; _i++) {
        watcher = watchers[_i];
        watcher.close();
      }
      return cb();
    }
  };
  _results = [];
  for (_i = 0, _len = files.length; _i < _len; _i++) {
    file = files[_i];
    try {
      watcher = fs.watch(file, doCallback);
    } catch (err) {
      watcher = watchFileFallback(file, doCallback);
    }
    _results.push(watchers.push(watcher));
  }
  return _results;
};

libs = null;

compile = function(_options, cb) {
  var lib, _ref;
  options = _options;
  libs = (_ref = options.libs) != null ? _ref : [];
  libs = (function() {
    var _i, _len, _results;
    _results = [];
    for (_i = 0, _len = libs.length; _i < _len; _i++) {
      lib = libs[_i];
      _results.push(path.resolve(lib));
    }
    return _results;
  })();
  libs.unshift(".");
  root = null;
  return collectDependencies(process.cwd(), options.mainfile, function(collect_err) {
    if (collect_err && !(root != null)) {
      cb(collect_err);
      return;
    }
    return resolveDependencyChain(root, function(err, dependency_chain) {
      var dep, output;
      if (_options.watch) {
        watchFiles((function() {
          var _i, _len, _results;
          _results = [];
          for (_i = 0, _len = dependency_chain.length; _i < _len; _i++) {
            dep = dependency_chain[_i];
            _results.push(dep.path);
          }
          return _results;
        })(), function() {
          return compile(_options, cb);
        });
      }
      if (err) {
        cb(err);
      } else if (collect_err) {
        cb(collect_err);
      } else {
        output = ((function() {
          var _i, _len, _results;
          _results = [];
          for (_i = 0, _len = dependency_chain.length; _i < _len; _i++) {
            dep = dependency_chain[_i];
            _results.push(dep.compiled_js);
          }
          return _results;
        })()).join("\n");
        cb(null, output);
      }
    });
  });
};

extensions = {
  '.coffee': {
    compile: function(code) {
      return require('coffee-script').compile(code, {
        bare: options.bare
      });
    },
    depend_re: /^#depend (".+")$/gm
  },
  '.js': {
    compile: function(code) {
      if (options.bare) {
        return code;
      } else {
        return "(function(){\n" + code + "}).call(this);";
      }
    },
    depend_re: /^\/\/depend (".+");?$/gm
  },
  '.co': {
    compile: function(code) {
      return require('coco').compile(code, {
        bare: options.bare
      });
    },
    depend_re: /^#depend (".+")$/gm
  },
  '.ls': {
    compile: function(code) {
      return require('LiveScript').compile(code, {
        bare: options.bare
      });
    },
    depend_re: /^#depend (".+")$/gm
  }
};

module.exports = {
  compile: compile,
  extensions: extensions
};
