# HDR10+ Sample Files

Test sample files and DASH streams for HDR10 / HDR10+.

---

## Tools Used

| Tool | Purpose |
|------|---------|
| ffmpeg (libx265) | HEVC encoding |
| ffmpeg (libaom-av1) | AV1 encoding |
| hdr10plus_tool | HEVC HDR10+ dynamic metadata (SEI) injection |
| inject_av1_hdr10plus.py | AV1 HDR10+ dynamic metadata (OBU) injection |

---

## Sample Description

### HEVC HDR10 (`hevc/hdr10_sample.mp4`)

- Codec: HEVC (H.265) Main10
- HDR: HDR10 (static metadata only)
- Color: BT.2020 / SMPTE ST 2084 (PQ)
- MaxCLL: 1000 nits / MaxFALL: 400 nits

### HEVC HDR10+ (`hevc/hdr10plus_sample.mp4`)

- Codec: HEVC (H.265) Main10
- HDR: HDR10+ (static + dynamic metadata)
- Dynamic Metadata: SMPTE ST 2094-40 (T.35 SEI, per-frame luminance info)
- Color: BT.2020 / SMPTE ST 2084 (PQ)
- MaxCLL: 1000 nits / MaxFALL: 400 nits

### AV1 HDR10 (`av1/av1_hdr10_sample.mp4`)

- Codec: AV1 Main Profile, Level 4.0, 10bit
- HDR: HDR10 (static metadata only)
- Color: BT.2020 / SMPTE ST 2084 (PQ)
- MaxCLL: 1000 nits / MaxFALL: 400 nits

### AV1 HDR10+ (`av1/av1_hdr10plus_sample.mp4`)

- Codec: AV1 Main Profile, Level 4.0, 10bit
- HDR: HDR10+ (static + dynamic metadata)
- Dynamic Metadata: SMPTE ST 2094-40 (T.35 Metadata OBU, per-frame luminance info)
- Color: BT.2020 / SMPTE ST 2084 (PQ)
- MaxCLL: 1000 nits / MaxFALL: 400 nits

### DASH Streams

Each sample is also available as a DASH (Dynamic Adaptive Streaming over HTTP) stream.

| Path | Codec | HDR |
|------|-------|-----|
| `hevc/dash_hdr10/manifest.mpd` | `hvc1.2.4.L120.B0` | HDR10 |
| `hevc/dash_hdr10plus/manifest.mpd` | `hvc1.2.4.L120.B0` | HDR10+ |
| `av1/dash_hdr10/manifest.mpd` | `av01.0.08M.10.0.110.09.16.09.0` | HDR10 |
| `av1/dash_hdr10plus/manifest.mpd` | `av01.0.08M.10.0.110.09.16.09.0` | HDR10+ |

---

## Common Specs

| Item | Value |
|------|-------|
| Resolution | 1920x1080 |
| Frame Rate | 24fps |
| Color Space | BT.2020 |
| Transfer Characteristics | SMPTE ST 2084 (PQ) |
| Audio | AAC-LC 192kbps 48kHz Stereo |

---

## Test Results

### Tizen TV 2025 (USB Playback)

| Sample | Playback | HDR Recognition |
|--------|----------|-----------------|
| HEVC HDR10 | ✅ | HDR10 |
| HEVC HDR10+ | ✅ | HDR10+ |
| AV1 HDR10 | ✅ | HDR10 |
| AV1 HDR10+ | ✅ | HDR10+ |

> Tizen Browser does not support AV1 / HEVC, so playback via the web test page is not available.

### Chrome PC / Windows (DASH Streaming)

| Sample | Playback |
|--------|----------|
| HEVC HDR10 MP4 | ✅ |
| HEVC HDR10+ MP4 | ✅ |
| AV1 HDR10 MP4 | ✅ |
| AV1 HDR10+ MP4 | ✅ |
| HEVC HDR10 DASH | ✅ |
| HEVC HDR10+ DASH | ✅ |
| AV1 HDR10 DASH | ✅ |
| AV1 HDR10+ DASH | ✅ |

Open `index.html` via an HTTP server to play HEVC / AV1 HDR10 and HDR10+ DASH streams.

> **Chrome recommended** — Use the latest version of Chrome for AV1 HDR10+ playback.
