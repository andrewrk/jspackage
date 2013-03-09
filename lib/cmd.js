var compile = require('./jspackage').compile
  , fs = require('fs')
  , path = require('path')
  , optparse = require('optparse')

var switches = [
  ['-h', '--help', "shows this help section and exit"],
  ['-v', '--version', "print the version number and exit"],
  ['-b', '--bare', "compile without a top-level function wrapper"],
  ['-w', '--watch', "watch source files and recompile when any change"],
  ['-l', '--lib PATH', "add an additional search directory for source files"]
];

var parser = new optparse.OptionParser(switches);
var mainfile = null;
var output = null;
var options = {};
parser.on('help', function(){
  printUsage();
  process.exit(1);
});
parser.on('version', function(){
  var libDir = path.dirname(fs.realpathSync(__filename));
  var pkgPath = path.resolve(libDir, "..", "package.json");
  var data = fs.readFileSync(pkgPath, 'utf8');
  var pkg = JSON.parse(data);
  console.log(pkg.version);
  process.exit(1);
});
parser.on(0, function(it){
  mainfile = it;
});
parser.on(1, function(it){
  output = it;
});
parser.on('bare', function(){
  options.bare = true;
});
parser.on('watch', function(){
  options.watch = true;
});
parser.on('lib', function(name, value){
  (options.libs || (options.libs = [])).push(value);
});
parser.parse(process.argv.splice(2));
if (!mainfile || !output) {
  printUsage();
  process.exit(1);
}
var ext = path.extname(mainfile);
if (ext.length > 0) {
  mainfile = mainfile.substring(0, mainfile.length - ext.length);
}
options.mainfile = mainfile;
compile(options, function(err, code){
  if (options.watch) {
    var timestamp = new Date().toLocaleTimeString();
    if (err) {
      console.error(timestamp + " - error: " + err);
    } else {
      console.info(timestamp + " - generated " + output);
      fs.writeFile(output, code);
    }
  } else {
    if (err) throw err;
    fs.writeFile(output, code);
  }
});
function printUsage() {
  parser.banner = "Usage: jspackage input_file output_file [options]";
  console.log(parser.toString());
}
