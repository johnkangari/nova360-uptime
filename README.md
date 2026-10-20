# uptime

[![Uptime](https://github.com/johnkangari/nova360-uptime/actions/workflows/uptime.yml/badge.svg)](https://github.com/johnkangari/nova360-uptime/actions/workflows/uptime.yml) [![Iran reachability](https://github.com/johnkangari/nova360-uptime/actions/workflows/iran.yml/badge.svg)](https://github.com/johnkangari/nova360-uptime/actions/workflows/iran.yml)

Scheduled checks for me.nova360.io and desk.nova360.io.

- **Uptime** (every 5 min): requests the site from GitHub's runners. A failed run means the site is down for everyone, usually the laptop, Docker or the Cloudflare tunnel. GitHub emails the account that last edited the workflow.
- **Iran reachability** (every 30 min): me.nova360.io through check-host.net's Iranian nodes. Each run appends a row to [`log/iran.csv`](log/iran.csv) and fails if fewer than 4 nodes get through.

Sites are listed in `SITES` and `IRAN_SITES` at the top of `check.mjs`. Run locally with `node check.mjs` or `node check.mjs --iran`.

GitHub can delay scheduled runs by several minutes when it's busy, so treat the interval as approximate.

## Where to look

- The badges above show the latest result. Click one for the run history; each run's page has a small results table.
- Failed uptime runs email the account that last edited the workflow.
- Iran history is in [`log/iran.csv`](log/iran.csv). A row marked `probe unavailable` means check-host.net was rate limiting GitHub's runners, not that the site was down; those runs finish with a warning instead of failing.
