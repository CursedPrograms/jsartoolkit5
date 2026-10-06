# ARToolKit.js (jsartoolkit5)

[ARToolKit5](https://github.com/artoolkitx/artoolkit5) compiled to JavaScript and WebAssembly with
[Emscripten](https://emscripten.org/): marker-based and image-based (NFT) augmented reality in the browser.

This is a maintained fork of [artoolkitx/jsartoolkit5](https://github.com/artoolkitx/jsartoolkit5), updated to
build with current Emscripten and to work in current browsers. See [Changes in this fork](#changes-in-this-fork).

## Marker types

- Square pictorial markers (e.g. the Hiro marker)
- Square barcode (matrix) markers
- Multi-marker sets
- NFT (Natural Feature Tracking) markers: track almost any image

## Project structure

| Folder | Contents |
|---|---|
| `build/` | The compiled library: `artoolkit.min.js` (optimized, JS API included), `artoolkit.debug.js` (debug symbols, no API), `artoolkit_wasm.js` + `artoolkit_wasm.wasm` (WebAssembly, JS API included) |
| `js/` | The JavaScript API (`artoolkit.api.js`), the Three.js helper (`artoolkit.three.js`), a worker script and TypeScript typings |
| `emscripten/` | The C++ binding between ARToolKit and JavaScript, plus the ARToolKit5 sources as a git submodule (`emscripten/artoolkit5`) |
| `examples/` | Demos for the raw API, Three.js, Babylon.js, WebAssembly and NFT with web workers |
| `tests/` | QUnit tests for the JS and WebAssembly builds |
| `tools/` | The build script (`makem.js`) |

## Which build to use

**Pure JavaScript**, with the JS API included:

```html
<script src="build/artoolkit.min.js"></script>
```

**WebAssembly** (smaller and faster). Set the `.wasm` location first; the library loads asynchronously and fires
`artoolkit-loaded` when it is ready:

```html
<script>
  var artoolkit_wasm_url = 'build/artoolkit_wasm.wasm';
</script>
<script src="build/artoolkit_wasm.js"></script>
<script>
  window.addEventListener('artoolkit-loaded', function () {
    // use ARController, ARCameraParam... here
  });
</script>
```

**Debug build.** It does not include the JS API, so load that separately:

```html
<script async src="build/artoolkit.debug.js"></script>
<script src="js/artoolkit.api.js"></script>
```

**Three.js helper.** Load Three.js and `js/artoolkit.three.js` after the library. It adds
`ARController.getUserMediaThreeScene()`, which sets up the camera, an `ARController` and a Three.js scene in one call:

```html
<script src="build/artoolkit.min.js"></script>
<script src="examples/js/third_party/three.js/three.min.js"></script>
<script src="js/artoolkit.three.js"></script>
```

## Usage

The basic steps:

1. Load the camera calibration with `ARCameraParam`
2. Create an `ARController` for your image, video or canvas
3. Choose the pattern detection mode (pattern markers are the default)
4. Load your markers
5. Listen for `getMarker` (or `getMultiMarker`, `getNFTMarker`) events
6. Call `process()` for each frame

### Detect a pattern marker in an image

```html
<img id="photo" src="Data/img.jpg">
<script src="build/artoolkit.min.js"></script>
<script>
  var img = document.getElementById('photo');

  var param = new ARCameraParam('Data/camera_para.dat', function () {
    var ar = new ARController(img, param);   // or new ARController(width, height, param)

    // Pattern markers only is the default. For barcode markers use
    // artoolkit.AR_MATRIX_CODE_DETECTION; for both, AR_TEMPLATE_MATCHING_COLOR_AND_MATRIX
    // (which is more error-prone).
    ar.setPatternDetectionMode(artoolkit.AR_TEMPLATE_MATCHING_COLOR);

    ar.addEventListener('getMarker', function (ev) {
      var marker = ev.data.marker;
      console.log('found marker', marker.idPatt, 'transform', ev.data.matrix);
    });

    ar.loadMarker('Data/patt.hiro', function (markerId) {
      ar.trackPatternMarkerId(markerId);
      ar.process(img);
    });
  }, function (err) {
    console.error('could not load the camera parameters', err);
  });
</script>
```

In pattern mode the barcode fields of a marker (`idMatrix`, `dirMatrix`, `cfMatrix`) are `-1`, and in barcode mode
the pattern fields (`idPatt`...) are `-1`.

### Use the camera

`ARController.getUserMediaARController()` opens the camera and creates the controller for you:

```js
ARController.getUserMediaARController({
  cameraParam: 'Data/camera_para.dat',
  maxARVideoSize: 640,
  facingMode: 'environment',
  onSuccess: function (ar, arCameraParam) {
    ar.loadMarker('Data/patt.hiro', function (markerId) {
      ar.trackPatternMarkerId(markerId);
      (function tick() {
        ar.process();
        requestAnimationFrame(tick);
      })();
    });
  },
  onError: function (err) { console.error(err); }
});
```

Browsers only allow camera access on a **secure page**: `https://` or `localhost`. Over plain `http://` (for example,
from your phone on the local network) the library reports "Camera access needs a secure page".

### NFT (image) tracking with a web worker

**NFT** (Natural Feature Tracking) tracks almost any image instead of a black-bordered marker. See
`examples/nft_improved_worker/` for complete examples. To make your own NFT markers, use the
[NFT-Marker-Creator](https://carnaux.github.io/NFT-Marker-Creator/), after reading its
[guide to good markers](https://github.com/Carnaux/NFT-Marker-Creator/wiki/Creating-good-markers).

A shortened version of that example:

```html
<div id="container">
  <video id="video" playsinline muted></video>
  <canvas id="canvas_draw" style="position: absolute; left: 0; top: 0"></canvas>
</div>
<!-- main_worker.js starts the web worker, see examples/nft_improved_worker -->
<script src="main_worker.js"></script>
<script>
  var container = document.getElementById('container');
  var video = document.getElementById('video');
  var canvas_draw = document.getElementById('canvas_draw');

  navigator.mediaDevices.getUserMedia({
    audio: false,
    video: { facingMode: { ideal: 'environment' } }
  }).then(function (stream) {
    video.srcObject = stream;
    video.play();
    video.addEventListener('loadedmetadata', function () {
      start(container, markers['pinball'], video, video.videoWidth, video.videoHeight, canvas_draw,
        function () { statsMain.update(); },
        function () { statsWorker.update(); });
    });
  });
</script>
```

### Constants

The ARToolKit constants are available on the `artoolkit` object, e.g. `artoolkit.AR_TEMPLATE_MATCHING_COLOR`.

```
AR_DEBUG_DISABLE, AR_DEBUG_ENABLE, AR_DEFAULT_DEBUG_MODE
AR_LABELING_WHITE_REGION, AR_LABELING_BLACK_REGION, AR_DEFAULT_LABELING_MODE, AR_DEFAULT_LABELING_THRESH
AR_IMAGE_PROC_FRAME_IMAGE, AR_IMAGE_PROC_FIELD_IMAGE, AR_DEFAULT_IMAGE_PROC_MODE
AR_TEMPLATE_MATCHING_COLOR, AR_TEMPLATE_MATCHING_MONO, AR_MATRIX_CODE_DETECTION,
AR_TEMPLATE_MATCHING_COLOR_AND_MATRIX, AR_TEMPLATE_MATCHING_MONO_AND_MATRIX, AR_DEFAULT_PATTERN_DETECTION_MODE
AR_USE_TRACKING_HISTORY, AR_NOUSE_TRACKING_HISTORY, AR_USE_TRACKING_HISTORY_V2, AR_DEFAULT_MARKER_EXTRACTION_MODE
AR_MAX_LOOP_COUNT, AR_LOOP_BREAK_THRESH
AR_MATRIX_CODE_3x3, AR_MATRIX_CODE_3x3_HAMMING63, AR_MATRIX_CODE_3x3_PARITY65,
AR_MATRIX_CODE_4x4, AR_MATRIX_CODE_4x4_BCH_13_9_3, AR_MATRIX_CODE_4x4_BCH_13_5_5
AR_LABELING_THRESH_MODE_MANUAL, AR_LABELING_THRESH_MODE_AUTO_MEDIAN,
AR_LABELING_THRESH_MODE_AUTO_OTSU, AR_LABELING_THRESH_MODE_AUTO_ADAPTIVE
AR_MARKER_INFO_CUTOFF_PHASE_NONE, AR_MARKER_INFO_CUTOFF_PHASE_PATTERN_EXTRACTION,
AR_MARKER_INFO_CUTOFF_PHASE_MATCH_GENERIC, AR_MARKER_INFO_CUTOFF_PHASE_MATCH_CONTRAST,
AR_MARKER_INFO_CUTOFF_PHASE_MATCH_BARCODE_NOT_FOUND, AR_MARKER_INFO_CUTOFF_PHASE_MATCH_BARCODE_EDC_FAIL,
AR_MARKER_INFO_CUTOFF_PHASE_MATCH_CONFIDENCE, AR_MARKER_INFO_CUTOFF_PHASE_POSE_ERROR,
AR_MARKER_INFO_CUTOFF_PHASE_POSE_ERROR_MULTI, AR_MARKER_INFO_CUTOFF_PHASE_HEURISTIC_TROUBLESOME_MATRIX_CODES
```

## Run the examples and tests

The pages load their data files with requests, so serve the repository from a local web server rather than opening
the files directly. Any static server works:

```
npm install
npm run test                       # http-server on port 8085
# or, without Node: python -m http.server 8085
```

Then open:

- Examples: http://localhost:8085/examples/
- Tests (JavaScript build): http://localhost:8085/tests/index.html
- Tests (WebAssembly build): http://localhost:8085/tests/index_wasm.html

Use `localhost`, not your machine's IP address, so the camera examples are allowed to use the camera. The
`getUserMedia` and trackable-registration tests need a webcam; without one they fail with "Requested device not
found", and the other 11 tests still run.

## Clone the repository

1. Clone this repository
2. Get the ARToolKit5 sources: `git submodule update --init`. If you already have ARToolKit5 elsewhere, either:
   - link `emscripten/artoolkit5` to it (Linux and macOS), or
   - set the `ARTOOLKIT5_ROOT` environment variable to your clone

## Build the library

The prebuilt files in `build/` are ready to use, so you only need to build after changing the C++ binding or
`js/artoolkit.api.js`. The API is compiled into `artoolkit.min.js` and the WebAssembly build, so changes to it only
reach those builds after a rebuild.

The build uses current [Emscripten](https://emscripten.org/) (tested with **6.0.10**). The old fastcomp toolchain
(1.39.x) and the `trzeci/emscripten` Docker images no longer work with `tools/makem.js`.

### With Docker

1. Install [Docker](https://www.docker.com/)
2. `git submodule update --init`
3. From the jsartoolkit5 folder:
   ```
   docker run --rm -v "$(pwd)":/src -w /src emscripten/emsdk:6.0.10 node tools/makem.js
   ```

### With a local Emscripten SDK (Linux, macOS, Windows)

1. Install the [Emscripten SDK](https://emscripten.org/docs/getting_started/downloads.html). It includes Node.js
   and Python:
   ```
   git clone https://github.com/emscripten-core/emsdk.git
   cd emsdk
   ./emsdk install latest      # Windows: emsdk install latest
   ./emsdk activate latest
   source ./emsdk_env.sh       # Windows: emsdk_env.bat
   ```
2. `git submodule update --init`
3. From the jsartoolkit5 folder: `node tools/makem.js` (or `npm run build-local`)

During development, `npm run watch` rebuilds whenever `./js/` changes.

Build notes:
- The ARToolKit5 sources predate current compilers, so the build patches two things in the submodule: it creates
  `include/AR/config.h` from `config.h.in`, and replaces the `isnan`/`isinf` macros in
  `lib/SRC/KPM/FreakMatcher/framework/error.h`, which clash with the C++ standard library. The submodule therefore
  shows as modified after a build; this is expected.
- On Windows, long compiler command lines are passed to emcc through response files (`build/*.rsp`, git-ignored).

## Build the API documentation

```
npm install
npm run create-doc
```

The documentation is written to `doc/reference`.

## Changes in this fork

- **Builds with current Emscripten (6.x)** on Linux, macOS and Windows. Upstream needed Emscripten 1.39 (2019),
  whose compiler backend was discontinued.
- **Marker info fix:** in pattern-only mode the barcode fields (`idMatrix`, `dirMatrix`, `cfMatrix`) returned
  leftover memory (e.g. `1135813393`). They are now `-1` ("invalid"), as ARToolKit documents; the same goes for
  the pattern fields in barcode-only mode.
- **Camera code:** removed the fallbacks for browser APIs that no longer exist (`navigator.getUserMedia`,
  `MediaStreamTrack.getSources`, `createObjectURL(stream)`). On a page that is not secure, the error now says that
  `https://` or `localhost` is needed instead of "not supported on your browser".
- **Windows checkouts:** `.gitattributes` treated the binary `.dat` camera files as text, so Git corrupted them on
  Windows and the examples could not load them.
- **Example video:** current Chrome no longer plays Ogg Theora, so the video examples now use an MP4
  (`Data/output_4.mp4`), with the Ogg as a fallback.
- **Examples and tests:** `simple_rtc.html` uses `navigator.mediaDevices`; the WebAssembly tests wait for the module
  before starting (before, they ran 0 tests); the tests no longer crash or hang when there is no camera.

## License and issues

jsartoolkit5 and ARToolKit5 are licensed under the [LGPL v3](LICENSE.txt).

Report problems with this fork at [github.com/CursedPrograms/jsartoolkit5/issues](https://github.com/CursedPrograms/jsartoolkit5/issues).
The original project is [artoolkitx/jsartoolkit5](https://github.com/artoolkitx/jsartoolkit5).
