/*
 * Simple script for running emcc on ARToolKit
 * @author zz85 github.com/zz85
 * @author ThorstenBux github.com/ThorstenBux
 */


var
	exec = require('child_process').exec,
	path = require('path'),
  fs = require('fs'),
  os = require('os'),
	child;

const platform = os.platform();

var HAVE_NFT = 1;

var EMSCRIPTEN_ROOT = process.env.EMSCRIPTEN;
var ARTOOLKIT5_ROOT = process.env.ARTOOLKIT5_ROOT || path.resolve(__dirname, "../emscripten/artoolkit5");

if (!EMSCRIPTEN_ROOT) {
  console.log("\nWarning: EMSCRIPTEN environment variable not found.")
  console.log("If you get a \"command not found\" error,\ndo `source <path to emsdk>/emsdk_env.sh` and try again.");
}

var EMCC = EMSCRIPTEN_ROOT ? path.resolve(EMSCRIPTEN_ROOT, 'emcc') : 'emcc';
var EMPP = EMSCRIPTEN_ROOT ? path.resolve(EMSCRIPTEN_ROOT, 'em++') : 'em++';
var OPTIMIZE_FLAGS = ' -Oz '; // -Oz for smallest size
var MEM = 256 * 1024 * 1024; // 64MB


var SOURCE_PATH = path.resolve(__dirname, '../emscripten/') + '/';
var OUTPUT_PATH = path.resolve(__dirname, '../build/') + '/';

var BUILD_DEBUG_FILE = 'artoolkit.debug.js';
var BUILD_WASM_FILE = 'artoolkit_wasm.js';
var BUILD_MIN_FILE = 'artoolkit.min.js';

// The final link uses em++, which compiles every input as C++, so only the C++ binding
// goes here; the C tracking helpers are built with the ARToolKit library (see below)
var MAIN_SOURCES = [
	'ARToolKitJS.cpp',
];

var TRACKING_SOURCES = [
	'trackingMod.c',
	'trackingMod2d.c',
];

if (!fs.existsSync(path.resolve(ARTOOLKIT5_ROOT, 'include/AR/config.h'))) {
	console.log("Renaming and moving config.h.in to config.h");
	fs.copyFileSync(
		path.resolve(ARTOOLKIT5_ROOT, 'include/AR/config.h.in'),
		path.resolve(ARTOOLKIT5_ROOT, 'include/AR/config.h')
	);
	console.log("Done!");
}

// The KPM (NFT) framework/error.h defines isnan/isinf as macros, which break libc++'s
// <complex> (pulled in by Eigen) with current compilers. They are only used in that
// header, so swap them for the std:: functions before compiling.
var ERROR_H = path.resolve(ARTOOLKIT5_ROOT, 'lib/SRC/KPM/FreakMatcher/framework/error.h');
var errorH = fs.readFileSync(ERROR_H, 'utf8');
if (/#define isnan\(x\)/.test(errorH)) {
	console.log("Patching KPM framework/error.h (isnan/isinf macros)");
	errorH = errorH
		.replace(/#define isnan\(x\)[^\r\n]*\r?\n/, '#include <cmath>\n')
		.replace(/#define isinf\(x\)[^\r\n]*\r?\n/, '')
		.replace('ASSERT(!isnan(x)', 'ASSERT(!std::isnan(x)')
		.replace('ASSERT(!isinf(x)', 'ASSERT(!std::isinf(x)');
	fs.writeFileSync(ERROR_H, errorH);
}

MAIN_SOURCES = MAIN_SOURCES.map(function(src) {
  return path.resolve(SOURCE_PATH, src);
}).join(' ');

let srcTest = path.resolve(__dirname, ARTOOLKIT5_ROOT + '/lib/SRC/');

let arSources, ar_sources;

// Expand "dir/*.c" here instead of relying on the shell (cmd.exe does not expand
// wildcards, and the old Windows path needed the undeclared "glob" package)
function expandSources(patterns) {
	let r = [];
	for (let pattern of patterns) {
		let full = path.resolve(srcTest, pattern);
		let base = path.basename(full);
		if (base.indexOf('*') === -1) {
			r.push(full);
			continue;
		}
		let dir = path.dirname(full);
		let ext = base.slice(base.indexOf('*') + 1);
		fs.readdirSync(dir)
			.filter(function(f) { return f.endsWith(ext); })
			.sort()
			.forEach(function(f) { r.push(path.join(dir, f)); });
	}
	return r;
}

ar_sources = expandSources([
	'AR/arLabelingSub/*.c',
	'AR/*.c',
	'ARICP/*.c',
	'ARMulti/*.c',
	'Video/video.c',
	'ARUtil/log.c',
	'ARUtil/file_utils.c',
]);

var ar2_sources = [
    'handle.c',
    'imageSet.c',
    'jpeg.c',
    'marker.c',
    'featureMap.c',
    'featureSet.c',
    'selectTemplate.c',
    'surface.c',
    'tracking.c',
    'tracking2d.c',
    'matching.c',
    'matching2.c',
    'template.c',
    'searchPoint.c',
    'coord.c',
    'util.c',
].map(function(src) {
	return path.resolve(__dirname, ARTOOLKIT5_ROOT + '/lib/SRC/AR2/', src);
});

var kpm_sources = [
	'kpmHandle.cpp',
	'kpmRefDataSet.cpp',
	'kpmMatching.cpp',
	'kpmResult.cpp',
	'kpmUtil.cpp',
	'kpmFopen.c',
	'FreakMatcher/detectors/DoG_scale_invariant_detector.cpp',
	'FreakMatcher/detectors/gaussian_scale_space_pyramid.cpp',
	'FreakMatcher/detectors/gradients.cpp',
	'FreakMatcher/detectors/harris.cpp',
	'FreakMatcher/detectors/orientation_assignment.cpp',
	'FreakMatcher/detectors/pyramid.cpp',
	'FreakMatcher/facade/visual_database_facade.cpp',
	'FreakMatcher/matchers/hough_similarity_voting.cpp',
	'FreakMatcher/matchers/freak.cpp',
	'FreakMatcher/framework/date_time.cpp',
	'FreakMatcher/framework/image.cpp',
	'FreakMatcher/framework/logger.cpp',
	'FreakMatcher/framework/timers.cpp',
].map(function(src) {
	return path.resolve(__dirname, ARTOOLKIT5_ROOT + '/lib/SRC/KPM/', src);
});

if (HAVE_NFT) {
  ar_sources = ar_sources
  .concat(ar2_sources)
  .concat(kpm_sources);
}

ar_sources = ar_sources.concat(TRACKING_SOURCES.map(function(src) {
	return path.resolve(SOURCE_PATH, src);
}));

// ARToolKit's config.h checks for EMSCRIPTEN, which old Emscripten defined; current
// versions only define __EMSCRIPTEN__
var DEFINES = ' -D EMSCRIPTEN ';
// The KPM (NFT) C++ sources use pre-C++17 throw() specifications, an error by default now
DEFINES += ' -Wno-dynamic-exception-spec ';
// ...and std::auto_ptr / std::binder1st (also in the bundled Eigen), removed in C++17;
// libc++ can still provide the removed features for old code
DEFINES += ' -D _LIBCPP_ENABLE_CXX17_REMOVED_AUTO_PTR -D _LIBCPP_ENABLE_CXX17_REMOVED_BINDERS -Wno-deprecated-declarations ';
if (HAVE_NFT) DEFINES += ' -D HAVE_NFT ';

// Flags for current Emscripten (3.x/4.x, LLVM backend). The old fastcomp-only flags
// (TOTAL_MEMORY, --memory-init-file, BINARYEN_TRAP_MODE, DEMANGLE_SUPPORT) no longer exist.
var FLAGS = '' + OPTIMIZE_FLAGS;
FLAGS += ' -s INITIAL_MEMORY=' + MEM + ' ';
FLAGS += ' -s USE_ZLIB=1';
FLAGS += ' -s USE_LIBJPEG=1';

// Compile-only flags for the intermediate library (no linker settings)
var LIB_FLAGS = '' + OPTIMIZE_FLAGS + ' -s USE_ZLIB=1 -s USE_LIBJPEG=1 ';

// artoolkit.api.js writes camera/marker files with FS.writeFile and passes video frames
// through Module.HEAPU8; newer Emscripten only exposes these when asked
FLAGS += ' -s FORCE_FILESYSTEM=1';
FLAGS += ' -s EXPORTED_RUNTIME_METHODS=FS,HEAPU8 ';

var WASM_FLAGS = ' ';

var PRE_FLAGS = ' --pre-js ' + path.resolve(__dirname, '../js/artoolkit.api.js') +' ';

FLAGS += ' -lembind ';

/* DEBUG FLAGS */
var DEBUG_FLAGS = ' -g ';
// DEBUG_FLAGS += ' -s ASSERTIONS=2 '
DEBUG_FLAGS += ' -s ASSERTIONS=1 '
DEBUG_FLAGS += ' --profiling '
DEBUG_FLAGS += ' -s ALLOW_MEMORY_GROWTH=1';

var INCLUDES = [
    path.resolve(__dirname, ARTOOLKIT5_ROOT + '/include'),
    OUTPUT_PATH,
    SOURCE_PATH,
    path.resolve(__dirname, ARTOOLKIT5_ROOT + '/lib/SRC/KPM/FreakMatcher'),
].map(function(s) { return '-I' + s }).join(' ');

function format(str) {
    for (var f = 1; f < arguments.length; f++) {
        str = str.replace(/{\w*}/, arguments[f]);
    }
    return str;
}

function clean_builds() {
    try {
        var stats = fs.statSync(OUTPUT_PATH);
    } catch (e) {
        fs.mkdirSync(OUTPUT_PATH);
    }

    try {
        var files = fs.readdirSync(OUTPUT_PATH);
        if (files.length > 0)
            for (var i = 0; i < files.length; i++) {
                var filePath = OUTPUT_PATH + '/' + files[i];
                if (fs.statSync(filePath).isFile())
                    fs.unlinkSync(filePath);
            }
    }
    catch(e) { return console.log(e); }
}

// -r links all the ARToolKit sources into one relocatable object, reused by the three builds
var compile_arlib = format(EMCC + ' ' + INCLUDES + ' '
    + ar_sources.join(' ')
    + LIB_FLAGS + ' ' + DEFINES + ' -r -o {OUTPUT_PATH}libar.o ',
    OUTPUT_PATH);

var compile_kpm = format(EMCC + ' ' + INCLUDES + ' '
    + kpm_sources.join(' ')
    + LIB_FLAGS + ' ' + DEFINES + ' -r -o {OUTPUT_PATH}libkpm.o ',
    OUTPUT_PATH);

var ALL_BC = " {OUTPUT_PATH}libar.o ";

// The final links use em++ so the C++ standard library (used by KPM and embind) is linked
var compile_combine = format(EMPP + ' ' + INCLUDES + ' '
    + ALL_BC + MAIN_SOURCES
    + FLAGS + ' -s WASM=0' + ' '  + DEBUG_FLAGS + DEFINES + ' -o {OUTPUT_PATH}{BUILD_FILE} ',
    OUTPUT_PATH, OUTPUT_PATH, BUILD_DEBUG_FILE);

var compile_combine_min = format(EMPP + ' ' + INCLUDES + ' '
    + ALL_BC + MAIN_SOURCES
    + FLAGS + ' -s WASM=0' + ' ' + DEFINES + PRE_FLAGS + ' -o {OUTPUT_PATH}{BUILD_FILE} ',
    OUTPUT_PATH, OUTPUT_PATH, BUILD_MIN_FILE);

var compile_wasm = format(EMPP + ' ' + INCLUDES + ' '
    + ALL_BC + MAIN_SOURCES
    + FLAGS + WASM_FLAGS + DEFINES + PRE_FLAGS + ' -o {OUTPUT_PATH}{BUILD_FILE} ',
    OUTPUT_PATH, OUTPUT_PATH, BUILD_WASM_FILE);

var compile_all = format(EMCC + ' ' + INCLUDES + ' '
    + ar_sources.join(' ')
    + FLAGS + ' ' + DEFINES + ' -o {OUTPUT_PATH}{BUILD_FILE} ',
    OUTPUT_PATH, BUILD_DEBUG_FILE);

/*
 * Run commands
 */

function onExec(error, stdout, stderr) {
    if (stdout) console.log('stdout: ' + stdout);
    if (stderr) console.log('stderr: ' + stderr);
    if (error !== null) {
        console.log('exec error: ' + error.code);
        process.exit(error.code);
    } else {
        runJob();
    }
}

function runJob() {
    if (!jobs.length) {
        console.log('Jobs completed');
        return;
    }
    var cmd = jobs.shift();

    if (typeof cmd === 'function') {
        cmd();
        runJob();
        return;
    }

    console.log('\nRunning command: ' + cmd + '\n');

    // cmd.exe caps a command line at ~8k characters and the source list is longer:
    // pass the arguments to emcc in a response file instead
    if (platform === 'win32' && cmd.length > 7000) {
        var split = cmd.indexOf(' ');
        var rsp = path.join(OUTPUT_PATH, 'args-' + jobs.length + '.rsp');
        fs.writeFileSync(rsp, cmd.slice(split + 1).replace(/\\/g, '/'));
        cmd = cmd.slice(0, split) + ' @' + rsp;
    }
    exec(cmd, { maxBuffer: 64 * 1024 * 1024 }, onExec);
}

var jobs = [];

function addJob(job) {
    jobs.push(job);
}

addJob(clean_builds);
addJob(compile_arlib);
//addJob(compile_kpm);
// compile_kpm
addJob(compile_combine);
addJob(compile_wasm);
addJob(compile_combine_min);
// addJob(compile_all);

runJob();
