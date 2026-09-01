# 09·13 · Media Pipelines

> **Why this exists:** "design YouTube / Instagram / a video platform" is a standard question, and ⭐ **the
> media pipeline is a DAG of expensive, retryable, fan-out jobs** — which makes it a clean application of
> almost everything in Phases 6–8.

---

## Reference

### The pipeline

```
upload (presigned, multipart)
   │
   ▼  storage event
VALIDATE ── probe format, duration, codec; reject early
   │
   ▼  ⭐ FAN OUT — the renditions are INDEPENDENT and parallel
   ├── 240p ──┐
   ├── 480p ──┤
   ├── 720p ──┼──▶ PACKAGE (HLS/DASH manifests) ──▶ CDN
   ├── 1080p ─┤
   └── thumbnails, preview GIF, captions, moderation
   │
   ▼
PUBLISH — flip status, notify the user
```

⭐ **Each rendition is an independent job**, so this is embarrassingly parallel — and it's the clearest real
example of a **workflow DAG** ([Phase 8 note 13](../../phase-08-architecture/notes/13-workflow-engines.md)).

### ⭐ The resolution ladder & adaptive bitrate

**Encode once into several quality levels; the CLIENT chooses per segment based on measured bandwidth.**

```
manifest.m3u8 ──▶ 240p/seg001.ts, seg002.ts …
                  720p/seg001.ts, seg002.ts …
```

⭐ **Media is chopped into 2–10 second SEGMENTS, and the player can switch level BETWEEN segments** — that's
why a video degrades in quality instead of buffering. ⭐ **Adaptive bitrate is a client-side decision your
server merely enables**, and saying that shows you understand where the intelligence lives.

**HLS** (Apple, `.m3u8`, universal) vs **DASH** (open standard) — ⭐ **converging on CMAF so one set of
segments serves both.** ⚠️ **Segment length is a trade: short = faster quality adaptation and lower live
latency, but more requests and more overhead.**

### ⭐ Making transcoding affordable — it is the dominant cost

⭐ **Transcoding is CPU/GPU-heavy and it is where the money goes.** The levers:

| | |
|---|---|
| ⭐ **Don't transcode everything up front** | ⚠️ **Most uploads are never watched.** Encode 480p + a thumbnail immediately; ⭐ **generate higher renditions LAZILY on first request, or only once views cross a threshold.** ⭐ **This is the single biggest saving and the answer interviewers want** |
| ⭐ **Spot/preemptible instances** | jobs are retryable and idempotent, so interruption is cheap — a near-perfect fit |
| **Hardware encoders** | GPU/ASIC: far faster, slightly worse quality per bit |
| ⭐ **Segment-parallel encoding** | split the source, encode chunks on many workers, concatenate — ⭐ **turns a 2-hour job into a 5-minute one** |
| **Modern codecs** | AV1/HEVC: much smaller files, ⚠️ **much more expensive to encode** — worth it only for the popular tail |
| **Per-title encoding** | tune the bitrate ladder to the content (animation needs far less than sport) |

### ⭐ The properties every job must have

| | |
|---|---|
| ⭐ **Idempotent** | at-least-once delivery ⇒ the same job runs twice. ⭐ **Key the output by `(asset_id, rendition)` so a rerun overwrites rather than duplicates** |
| ⭐ **Retryable with a bounded budget** | plus a **DLQ** and an alert ([Phase 6](../../phase-06-messaging/notes/)) |
| ⭐ **Progress-reporting** | a 2-hour job with no progress is indistinguishable from a hung one |
| **Priority lanes** | a paying customer's 30-second clip must not queue behind a free 4-hour upload — ⭐ **a bulkhead again** |
| ⭐ **Partial success is normal** | 1080p failed but 720p worked → ⭐ **publish what you have and retry the rest.** All-or-nothing is the wrong model here |

### Live streaming — the same shapes, harder constraints

```
ingest (RTMP/SRT) ──▶ transcode ladder ──▶ package ──▶ CDN edge ──▶ players
                      ⭐ all of it in SECONDS, continuously
```

| | |
|---|---|
| **Latency tiers** | standard HLS **~30 s** · **LL-HLS ~3–5 s** · **WebRTC sub-second** (⚠️ but WebRTC scales very differently and usually needs an SFU) |
| ⭐ **The trade** | ⭐ **latency vs buffer resilience** — every second you cut is a second less protection against a network hiccup |
| **DVR / rewind** | keep a rolling window of segments |
| ⭐ **No retries** | ⭐ **live is a stream you cannot re-run.** Redundant ingest and encoder failover are the design, not retries |

### Images — the same pattern, cheaper

⭐ **Don't pre-generate every size.** Resize **on demand at the edge** (an image CDN, or a Lambda@Edge) and
**cache the result** — the URL encodes the transform (`/img/abc123?w=400&fmt=webp`). ⚠️ **Sign or allowlist
the parameters** or you've built a free compute service for the internet.

**Also:** strip EXIF (⭐ **it contains GPS coordinates** — a privacy leak) · serve AVIF/WebP with fallbacks ·
generate a **blurhash/LQIP placeholder** for perceived speed.

### Other things to name

**DRM** (Widevine/FairPlay/PlayReady — encrypted segments + a licence server; ⭐ *required by studios, and
its complexity is often underestimated*) · **captions/transcription** (an ASR job in the same DAG) ·
**content moderation** (an ML pass before publish; ⭐ *"publish then moderate" vs "moderate then publish" is a
product decision with legal consequences*) · **perceptual hashing** for copyright matching · ⚠️ **storage of
all renditions dwarfs the source** — lifecycle the unpopular ones to cold storage.

---

## In your own words

**⭐ Draw the pipeline. Where does it fan out, and why is that convenient?**

>

**⭐ Explain adaptive bitrate. Where does the decision actually happen?**

>

**What's the trade on segment length?**

>

**⭐ What's the single biggest cost saving in a video platform, and why does it work?**

>

**Why are spot instances a near-perfect fit here?**

>

**⭐ How would you turn a 2-hour transcode into a 5-minute one?**

>

**⭐ Five properties every job needs. Why is partial success the right model?**

>

**⭐ How is live different, and what replaces retries?**

>

**Why resize images on demand rather than up front, and what must you guard?**

>

**Why strip EXIF?**

>

---

## Links

- Uploads, presigned URLs, lifecycle → [12-blob-storage.md](12-blob-storage.md)
- The DAG, and durable execution → [Phase 8 note 13](../../phase-08-architecture/notes/13-workflow-engines.md)
- Idempotent consumers, DLQs, retries → [Phase 6](../../phase-06-messaging/notes/)
- Priority lanes as bulkheads → [Phase 7 note 04](../../phase-07-reliability/notes/04-bulkheads-and-isolation.md)
- CDN and edge caching → [Phase 5](../../phase-05-caching/notes/)
- Partial success = graceful degradation → [Phase 7 note 06](../../phase-07-reliability/notes/06-graceful-degradation.md)
