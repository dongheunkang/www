// demuxer_mp4.js - MP4Box-based MP4 demuxer for the WebCodecs aligncheck page.
//
// Adapted from the tc-dec-mp4 sample to run on the MAIN thread: mp4box.all.min.js
// is loaded via a <script> tag (exposing the MP4Box and DataStream globals), so
// there is no importScripts() here. Demuxes the first video track of an MP4 and
// calls onConfig()/onChunk()/onDone() with WebCodecs objects.

// Wraps an MP4Box File as a WritableStream underlying sink.
class MP4FileSink {
  #setStatus = null;
  #file = null;
  #offset = 0;

  constructor(file, setStatus) {
    this.#file = file;
    this.#setStatus = setStatus;
  }

  write(chunk) {
    // MP4Box.js requires buffers to be ArrayBuffers, but we have a Uint8Array.
    const buffer = new ArrayBuffer(chunk.byteLength);
    new Uint8Array(buffer).set(chunk);

    // Inform MP4Box where in the file this chunk is from.
    buffer.fileStart = this.#offset;
    this.#offset += buffer.byteLength;

    this.#setStatus("fetch", (this.#offset / (1024 ** 2)).toFixed(1) + " MiB");
    this.#file.appendBuffer(buffer);
  }

  close() {
    this.#setStatus("fetch", "Done");
    this.#file.flush();
  }
}

// Demuxes the first video track of an MP4 file using MP4Box.
class MP4Demuxer {
  #onConfig = null;
  #onChunk = null;
  #onDone = null;
  #setStatus = null;
  #file = null;
  #track = null;

  constructor(uri, {onConfig, onChunk, onDone, setStatus}) {
    this.#onConfig = onConfig;
    this.#onChunk = onChunk;
    this.#onDone = onDone || (() => {});
    this.#setStatus = setStatus;

    this.#file = MP4Box.createFile();
    this.#file.onError = error => setStatus("demux", "error: " + error);
    this.#file.onReady = this.#onReady.bind(this);
    this.#file.onSamples = this.#onSamples.bind(this);

    const fileSink = new MP4FileSink(this.#file, setStatus);
    fetch(uri).then(response => {
      if (!response.ok) {
        setStatus("fetch", "HTTP " + response.status + " for " + uri);
        return;
      }
      response.body.pipeTo(new WritableStream(fileSink, {highWaterMark: 2}));
    }).catch(e => setStatus("fetch", "error: " + e));
  }

  // Get the codec `description` (av1C/avcC/hvcC/vpcC contents) for the track.
  #description(track) {
    const trak = this.#file.getTrackById(track.id);
    for (const entry of trak.mdia.minf.stbl.stsd.entries) {
      const box = entry.avcC || entry.hvcC || entry.vpcC || entry.av1C;
      if (box) {
        const stream = new DataStream(undefined, 0, DataStream.BIG_ENDIAN);
        box.write(stream);
        return new Uint8Array(stream.buffer, 8);  // Remove the box header.
      }
    }
    return undefined;  // Not required for VP8/VP9.
  }

  #onReady(info) {
    this.#setStatus("demux", "Ready");
    const track = info.videoTracks[0];
    this.#track = track;

    this.#onConfig({
      codec: track.codec.startsWith("vp08") ? "vp8" : track.codec,
      codedHeight: track.video.height,
      codedWidth: track.video.width,
      description: this.#description(track),
    });

    this.#file.setExtractionOptions(track.id, null, {nbSamples: Infinity});
    this.#file.start();
  }

  #onSamples(track_id, ref, samples) {
    for (const sample of samples) {
      this.#onChunk(new EncodedVideoChunk({
        type: sample.is_sync ? "key" : "delta",
        timestamp: 1e6 * sample.cts / sample.timescale,
        duration: 1e6 * sample.duration / sample.timescale,
        data: sample.data,
      }));
    }
    // All samples of the (single-track, non-fragmented) file are delivered in
    // one callback once flushed; signal completion.
    if (this.#track && samples.length &&
        samples[samples.length - 1].number + 1 >= this.#track.nb_samples) {
      this.#onDone();
    }
  }
}
