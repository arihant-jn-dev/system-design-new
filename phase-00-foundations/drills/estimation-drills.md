# Estimation Drills — Problems

**Rules:** paper, no calculator, 3-minute timer, assumptions said out loud.
Solutions in [`estimation-solutions.md`](estimation-solutions.md) — **don't peek until you've committed to an answer.**

Every problem ends with the same required final step:
> **Then state in one sentence: what is the hard part of this system, and what does that mean for the design?**

---

## 1 · Twitter-scale feed

> 100 M DAU. Each user posts 5 times/day. Each post is ~1 KB.
> Read:write ratio is 100:1.

Find: write QPS (avg + peak), read QPS (peak), storage/year (with replication), read bandwidth.

---

## 2 · URL shortener

> 100 M new short URLs created per day. Read:write ratio 100:1.
> Each record: short code + long URL + metadata ≈ 500 bytes. Retention: 5 years.

Find: write QPS, read QPS (peak), total storage over 5 years, and — **how many characters does the short
code need to be?** (base62, must cover 5 years of URLs.)

---

## 3 · Chat / WhatsApp

> 500 M DAU. Average 40 messages sent per user per day. Message ≈ 200 bytes.
> Assume each message is delivered to 1 recipient on average (mix of 1:1 and small groups).
> Messages stored for 30 days.

Find: message QPS (avg + peak), storage for 30 days, and **the number of concurrent connections** if 10% of
DAU are online at once. What does that last number imply about the server fleet?

---

## 4 · Photo sharing (Instagram-ish)

> 500 M DAU. Each user uploads 2 photos/day. Original 3 MB; you store 4 resized variants totalling 2 MB more.
> Each photo is viewed 50 times on average.

Find: upload QPS, storage/year (with replication), and **view bandwidth at peak**.
Which cost dominates — storage or egress?

---

## 5 · Video platform

> 1 M videos uploaded/day, average 10 minutes each.
> Each is transcoded into 5 resolutions; total stored size ≈ 1 GB per uploaded video (all renditions).
> 100 M hours watched per day at an average 3 Mbps.

Find: storage/year, average egress bandwidth for streaming, and **monthly egress cost at $0.085/GB**.
Then: what does that number tell you about the architecture?

---

## 6 · Ride-hailing location pings

> 5 M active drivers. Each sends a location ping every 4 seconds.
> Each ping ≈ 100 bytes (driver ID, lat, lng, timestamp, heading).

Find: ping QPS, ingest bandwidth, storage/day if you retain every ping.
Then: **should you retain every ping?** What would you actually keep, and what does that change?

---

## 7 · Ad click aggregator

> 10 B ad impressions/day. Click-through rate 0.5%.
> Each impression event ≈ 500 bytes; each click event ≈ 1 KB.
> Advertisers need dashboards refreshed within 1 minute.

Find: impression QPS (avg + peak), click QPS, raw event storage/day and /year.
Then: what makes this system hard — the volume, or the 1-minute freshness requirement? Justify.

---

## 8 · Ad serving latency budget

> Real-time bidding. **End-to-end budget: 100 ms**, measured from ad request to ad returned.
> The path is: user → your edge → auction service → 5 parallel bidder calls → response.
> Your servers are in Mumbai; 2 of the 5 bidders are in Singapore (~60 ms RTT), 3 are local (~1 ms RTT).

Find: how much of the 100 ms is consumed by network alone. What's left for compute?
Then: given the fan-out to 5 bidders, what is your *effective* latency, and what design change do you make?
(Use note 04 — tail latency amplification.)

---

## 9 · Cache sizing

> Read-heavy service, 50 K read QPS at peak. 500 M distinct objects, average 2 KB each.
> Access follows a Zipfian distribution: **20% of objects get 80% of traffic.**

Find: total dataset size, the size of the "hot 20%", and how much RAM you need to cache it.
Then: how many cache nodes (assume 64 GB usable RAM each)? What hit rate do you expect, and what read QPS
still reaches the database?

---

## 10 · Metrics system cardinality

> 10,000 servers. Each emits 500 distinct metrics. Each metric is scraped every 15 seconds.
> Each data point stored ≈ 16 bytes (timestamp + value, after compression).
> Retention: 15 days at full resolution.

Find: data points/second ingested, storage for 15 days.
Then: an engineer adds a `user_id` label to one metric, and there are 1 M users.
**What happens?** Quantify it. (This is the cardinality-explosion question, and it's asked a lot.)

---

## Bonus · The 30-second version

Once the ten above are reflex, practise this shape — it's what you'll actually do in an interview:

> Given *any* product, in 30 seconds: **DAU → actions/day → QPS → peak QPS → storage/year.**
> Say it out loud in one continuous sentence, without stopping to compute.

Try it cold on: Spotify · Google Docs · Uber Eats · LinkedIn · Zoom · your own company's product.
