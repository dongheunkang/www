// demuxer_ivf.js
// Minimal IVF container demuxer for VP8 / VP9 / AV1.
//
// IVF File Format:
//   File Header (32 bytes):
//     [0-3]  signature  "DKIF"
//     [4-5]  version    0
//     [6-7]  headerSize 32
//     [8-11] fourCC     "VP80" | "VP90" | "AV01"
//     [12-13] width
//     [14-15] height
//     [16-19] frameRateNum
//     [20-23] frameRateDen
//     [24-27] numFrames
//     [28-31] unused
//
//   Per-frame Header (12 bytes):
//     [0-3]  frameSize (uint32 LE)
//     [4-11] timestamp (uint64 LE, in timebase units)

class IVFDemuxer {
  #onConfig  = null;
  #onChunk   = null;
  #setStatus = null;

  constructor(uri, { onConfig, onChunk, setStatus }) {
    this.#onConfig  = onConfig;
    this.#onChunk   = onChunk;
    this.#setStatus = setStatus;

    this.#load(uri);
  }

  async #load(uri) {
    this.#setStatus("fetch", "Fetching…");
    let buffer;
    try {
      const response = await fetch(uri);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const total = parseInt(response.headers.get("Content-Length") || "0", 10);
      const reader = response.body.getReader();
      const chunks = [];
      let received = 0;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
        received += value.byteLength;
        if (total > 0)
          this.#setStatus("fetch", `${(received / total * 100).toFixed(0)}%`);
      }
      // Concatenate all chunks
      const all = new Uint8Array(received);
      let offset = 0;
      for (const c of chunks) { all.set(c, offset); offset += c.byteLength; }
      buffer = all.buffer;
    } catch (e) {
      this.#setStatus("fetch", `Error: ${e.message}`);
      return;
    }
    this.#setStatus("fetch", "Done");
    this.#parse(buffer);
  }

  #parse(buffer) {
    const view = new DataView(buffer);

    // Validate signature
    const sig = String.fromCharCode(
      view.getUint8(0), view.getUint8(1), view.getUint8(2), view.getUint8(3));
    if (sig !== "DKIF") {
      this.#setStatus("demux", "Error: not an IVF file");
      return;
    }

    const fourCC = String.fromCharCode(
      view.getUint8(8), view.getUint8(9), view.getUint8(10), view.getUint8(11));
    const width        = view.getUint16(12, true);
    const height       = view.getUint16(14, true);
    const frameRateNum = view.getUint32(16, true);
    const frameRateDen = view.getUint32(20, true);
    const numFrames    = view.getUint32(24, true);

    const codec = IVFDemuxer.#fourCCtoCodec(fourCC);
    if (!codec) {
      this.#setStatus("demux", `Unsupported IVF fourCC: ${fourCC}`);
      return;
    }

    this.#setStatus("demux", `${fourCC} ${width}×${height} (${numFrames} frames)`);

    // Build base config
    const config = { codec, codedWidth: width, codedHeight: height };

    // For AV1: extract Sequence Header OBU from the first frame and build
    // an AV1CodecConfigurationRecord as the description.
    // The first frame data starts at byte offset 44 (32 file header + 12 frame header).
    if (fourCC === "AV01") {
      const firstFrameSize = view.getUint32(32, true);
      const seqHeader = IVFDemuxer.#buildAV1Description(buffer, 44, firstFrameSize);
      if (seqHeader) config.description = seqHeader;
    }

    this.#onConfig(config);

    // Walk all frame headers and emit EncodedVideoChunks
    let pos = 32; // after file header
    const timebaseMicros = (frameRateDen / frameRateNum) * 1e6;
    let frameIdx = 0;

    while (pos + 12 <= buffer.byteLength) {
      const frameSize = view.getUint32(pos, true);
      // IVF timestamp: 64-bit LE; read as two 32-bit words (JS safe up to 2^53)
      const tsLo  = view.getUint32(pos + 4, true);
      const tsHi  = view.getUint32(pos + 8, true);
      const tsRaw = tsLo + tsHi * 0x100000000;

      pos += 12;
      if (pos + frameSize > buffer.byteLength) break;

      const data = buffer.slice(pos, pos + frameSize);
      pos += frameSize;

      const isKey = (frameIdx === 0) || IVFDemuxer.#isKeyframe(codec, fourCC, data);

      this.#onChunk(new EncodedVideoChunk({
        type:      isKey ? "key" : "delta",
        timestamp: Math.round(tsRaw * timebaseMicros),
        duration:  Math.round(timebaseMicros),
        data,
      }));

      frameIdx++;
    }
  }

  // Map IVF fourCC to WebCodecs codec string
  static #fourCCtoCodec(fourCC) {
    switch (fourCC) {
      case "VP80": return "vp8";
      case "VP90": return "vp09.00.41.08"; // Profile 0
      case "AV01": return "av01.0.04M.08"; // Main profile 8-bit
      default:     return null;
    }
  }

  // Detect keyframe for VP8 / VP9 / AV1
  static #isKeyframe(codec, fourCC, buffer) {
    const u8 = new Uint8Array(buffer);
    if (fourCC === "VP80") {
      // VP8: frame_tag bits[0] == 0 → key frame (bit 0 of first byte)
      return (u8[0] & 0x01) === 0;
    }
    if (fourCC === "VP90") {
      // VP9: frame_marker bits[7:6]==10, frame_type bit==0 → KEY_FRAME
      const marker = (u8[0] >> 6) & 0x3;
      if (marker !== 2) return false;
      return ((u8[0] >> 1) & 0x1) === 0;
    }
    if (fourCC === "AV01") {
      // AV1: scan OBUs for FRAME_HEADER_OBU (type 3) or FRAME_OBU (type 6).
      // A frame with a SEQUENCE_HEADER_OBU (type 1) is always a keyframe.
      return IVFDemuxer.#av1HasSequenceHeader(u8);
    }
    return false;
  }

  // Returns true if the AV1 bitstream contains a Sequence Header OBU.
  static #av1HasSequenceHeader(u8) {
    let i = 0;
    while (i < u8.length) {
      const obuHeader = u8[i++];
      const obuType   = (obuHeader >> 3) & 0xf;
      const hasExt    = (obuHeader >> 2) & 1;
      if (hasExt) i++;
      // Read LEB128 size
      let size = 0, shift = 0;
      while (i < u8.length) {
        const b = u8[i++];
        size |= (b & 0x7f) << shift;
        shift += 7;
        if (!(b & 0x80)) break;
      }
      if (obuType === 1) return true;  // SEQUENCE_HEADER_OBU
      i += size;
    }
    return false;
  }

  // Build an AV1CodecConfigurationRecord from the Sequence Header OBU
  // found in the first IVF frame. The record format (4 bytes + configOBUs):
  //   byte 0: marker(1=1) | version(7=1)  → 0x81
  //   byte 1: seq_profile(3) | seq_level_idx_0(5)
  //   byte 2: seq_tier_0(1) | high_bitdepth(1) | twelve_bit(1) | mono_chrome(1)
  //           | chroma_subsampling_x(1) | chroma_subsampling_y(1)
  //           | chroma_sample_position(2)
  //   byte 3: initial_presentation_delay_present(1) | reserved(3)
  //           | initial_presentation_delay_minus_one(4) or reserved(4)
  //   bytes 4+: raw Sequence Header OBU bytes (configOBUs)
  static #buildAV1Description(buffer, frameDataOffset, frameDataSize) {
    if (frameDataOffset + frameDataSize > buffer.byteLength) return null;
    const u8 = new Uint8Array(buffer, frameDataOffset, frameDataSize);

    // Find Sequence Header OBU
    let i = 0;
    while (i < u8.length) {
      const obuHeader = u8[i];
      const obuType   = (obuHeader >> 3) & 0xf;
      const hasExt    = (obuHeader >> 2) & 1;
      let headerBytes = 1 + (hasExt ? 1 : 0);

      // Read LEB128 size
      let size = 0, shift = 0, leb128Bytes = 0;
      let j = i + headerBytes;
      while (j < u8.length) {
        const b = u8[j++];
        size |= (b & 0x7f) << shift;
        shift += 7;
        leb128Bytes++;
        if (!(b & 0x80)) break;
      }

      if (obuType === 1 && size > 0) {
        // Found Sequence Header OBU – parse minimal fields for the record
        const seqData = u8.subarray(j, j + size);

        // seq_profile: bits[7:5] of seqData[0]
        const seqProfile = (seqData[0] >> 5) & 0x7;
        // still_picture: bit 4
        // reduced_still_picture_header: bit 3
        // For simplicity, use level 0 (seq_level_idx[0] first 5 bits in bitstream)
        // We just build the record with the raw OBU appended.

        const record = new Uint8Array(4 + headerBytes + leb128Bytes + size);
        record[0] = 0x81;                           // marker=1, version=1
        record[1] = (seqProfile << 5) | 0x00;      // seq_profile | seq_level_idx_0=0
        record[2] = 0x00;                           // tier/bitdepth flags (8-bit 4:2:0)
        record[3] = 0x00;                           // no initial_presentation_delay
        // Append the full OBU (header + size + payload)
        record.set(u8.subarray(i, i + headerBytes + leb128Bytes + size), 4);
        return record;
      }

      i += headerBytes + leb128Bytes + size;
    }
    return null;  // Sequence Header OBU not found; decoder may still work without it
  }
}
