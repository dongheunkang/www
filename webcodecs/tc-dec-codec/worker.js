// tc-dec-codec/worker.js
// Supports MP4 (H264/HEVC/AV1) via MP4Demuxer and IVF (VP8/VP9/AV1) via IVFDemuxer.
importScripts(
  "./mp4box.all.min.js",
  "./demuxer_mp4.js",
  "./renderer_2d.js",
  "./renderer_webgl.js",
  "./demuxer_ivf.js"
);

// ── Status helpers ──────────────────────────────────────────────────
let pendingStatus = null;

function setStatus(type, message) {
  if (pendingStatus) {
    pendingStatus[type] = message;
  } else {
    pendingStatus = { [type]: message };
    self.requestAnimationFrame(flushStatus);
  }
}

function flushStatus() {
  self.postMessage(pendingStatus);
  pendingStatus = null;
}

// ── Rendering ───────────────────────────────────────────────────────
let renderer     = null;
let pendingFrame = null;
let startTime    = null;
let frameCount   = 0;

function renderFrame(frame) {
  if (!pendingFrame) {
    requestAnimationFrame(renderAnimationFrame);
  } else {
    pendingFrame.close();
  }
  pendingFrame = frame;
}

function renderAnimationFrame() {
  renderer.draw(pendingFrame);
  pendingFrame = null;
}

// ── Codec tag helper ────────────────────────────────────────────────
function guessCodecLabel(codecStr) {
  const s = codecStr.toLowerCase();
  if (s.startsWith('hvc1') || s.startsWith('hev1')) return 'HEVC';
  if (s.startsWith('av01'))                          return 'AV1';
  if (s === 'vp8' || s.startsWith('vp08'))           return 'VP8';
  if (s.startsWith('vp09') || s.startsWith('vp9'))   return 'VP9';
  if (s.startsWith('avc1') || s.startsWith('avc3'))  return 'H.264';
  return codecStr;
}

// ── Entry point ─────────────────────────────────────────────────────
function start({ dataUri, rendererName, canvas }) {
  // Choose renderer
  switch (rendererName) {
    case 'webgl':
    case 'webgl2':
      renderer = new WebGLRenderer(rendererName, canvas);
      break;
    default:
      renderer = new Canvas2DRenderer(canvas);
  }

  // VideoDecoder
  const decoder = new VideoDecoder({
    output(frame) {
      if (startTime == null) {
        startTime = performance.now();
      } else {
        const elapsed = (performance.now() - startTime) / 1000;
        const fps = ++frameCount / elapsed;
        setStatus('render', `${fps.toFixed(0)} fps  (${frameCount} frames)`);
      }
      renderFrame(frame);
    },
    error(e) {
      setStatus('decode', `Error: ${e.message}`);
    }
  });

  // Chunk queue: holds chunks that arrive before configure() completes.
  // Needed because IVF demuxer dispatches all chunks synchronously in one
  // block, and MP4 with a fully-buffered fMP4 may do the same.
  const chunkQueue = [];

  const demuxCallbacks = {
    onConfig(config) {
      const label = guessCodecLabel(config.codec);
      setStatus('codec',  `${label}  [${config.codec}]`);
      setStatus('decode', `${label} @ ${config.codedWidth}×${config.codedHeight}`);

      // ── configure() must be called synchronously ──────────────────
      // isConfigSupported() is a Promise, so putting configure() inside
      // its .then() makes it async. All chunks arrive before the Promise
      // resolves, causing them to be silently dropped.
      try {
        decoder.configure(config);
      } catch (e) {
        setStatus('decode', `configure() error: ${e.message}`);
        return;
      }

      setStatus('decode', `Configured – ${label} @ ${config.codedWidth}×${config.codedHeight}`);

      // Flush chunks that arrived before configure() (IVF sync path)
      for (const chunk of chunkQueue) decoder.decode(chunk);
      chunkQueue.length = 0;

      // isConfigSupported for informational status only (non-blocking)
      VideoDecoder.isConfigSupported(config)
        .then(r => {
          if (!r.supported)
            setStatus('decode', `⚠ isConfigSupported: NOT supported (${config.codec})`);
        })
        .catch(() => {});
    },

    onChunk(chunk) {
      if (decoder.state === 'configured') {
        decoder.decode(chunk);
      } else {
        // Buffer until onConfig → configure() runs
        chunkQueue.push(chunk);
      }
    },

    setStatus
  };

  // Choose demuxer based on file extension
  const isIVF = dataUri.toLowerCase().endsWith('.ivf');
  if (isIVF) {
    new IVFDemuxer(dataUri, demuxCallbacks);
  } else {
    new MP4Demuxer(dataUri, demuxCallbacks);
  }
}

self.addEventListener('message', message => start(message.data), { once: true });
