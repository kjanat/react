'use strict';

const ClosureCompiler = require('google-closure-compiler').compiler;
const {promisify} = require('util');
const fs = require('fs');
const tmp = require('tmp');
const writeFileAsync = promisify(fs.writeFile);

// On JDK 23+ the JVM prints `sun.misc.Unsafe` deprecation warnings to stderr
// because Closure's bundled protobuf (com.google.protobuf.UnsafeUtil) calls
// these methods. They are not compilation errors, so strip them before using
// stderr to decide whether the compile failed. Genuine Closure diagnostics
// (`<file>: WARNING - ...`, `ERROR - ...`) do not match and are preserved.
function stripJVMUnsafeWarnings(stdErr) {
  if (!stdErr) {
    return stdErr;
  }
  return stdErr
    .split('\n')
    .filter(line => !/^WARNING:.*Unsafe/.test(line))
    .join('\n')
    .trim();
}

function compile(flags) {
  return new Promise((resolve, reject) => {
    const closureCompiler = new ClosureCompiler(flags);
    closureCompiler.run(function(exitCode, stdOut, stdErr) {
      const meaningfulStdErr = stripJVMUnsafeWarnings(stdErr);
      if (exitCode === 0 && !meaningfulStdErr) {
        resolve(stdOut);
      } else {
        reject(new Error(meaningfulStdErr || stdErr));
      }
    });
  });
}

module.exports = function closure(flags = {}) {
  return {
    name: 'scripts/rollup/plugins/closure-plugin',
    async renderChunk(code, chunk, options) {
      const inputFile = tmp.fileSync();

      // Tell Closure what JS source file to read, and optionally what sourcemap file to write
      const finalFlags = {
        ...flags,
        js: inputFile.name,
      };

      await writeFileAsync(inputFile.name, code, 'utf8');
      const compiledCode = await compile(finalFlags);

      inputFile.removeCallback();
      return {code: compiledCode};
    },
  };
};
