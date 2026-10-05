# Keep-warm worker

Pings the API's `/health/db` endpoint every 3 minutes so Render's free plan never spins the
service down (15 minutes idle → ~50-90s cold start on the next real visit) **and** so Neon's
serverless Postgres compute never autosuspends either.

These are two independent sleep timers. MEASURED 2026-10-05: pinging plain `/health` (which
does not touch the database) kept the Render container awake but did nothing for Neon — a
direct timed query showed ~1.9s on the first query after Neon's own idle suspend vs ~200ms
once warm, and that showed up as the app still feeling slow to load even with the worker
running. `/health/db` runs a trivial `SELECT 1` through Prisma, which resets Neon's idle timer
too. (Render's own `healthCheckPath` in `render.yaml` intentionally stays on plain `/health` —
tying Render's own liveness check to Neon's availability would restart a perfectly healthy
container during a transient DB blip.)

This exists because `.github/workflows/keep-api-warm.yml` does **not** work: GitHub throttles
scheduled workflows on shared runners hard — measured 2026-09-28, it ran ~12 times a day at
2-6 hour gaps instead of the 144 the `*/10` schedule asks for. Cloudflare runs cron triggers
on its own scheduler, so a 3-minute beat is actually a 3-minute beat.

## Deploy (one time, ~2 minutes)

```bash
cd ops/keep-warm-worker
npx wrangler login      # opens a browser, authorises the Cloudflare account that holds the domain
npx wrangler deploy
```

Then confirm it is scheduled: Cloudflare dashboard → Workers & Pages → `piscatio-keep-warm` →
Settings → Triggers → Cron Triggers should list `*/3 * * * *`. Visiting the worker's own
`*.workers.dev` URL runs the ping immediately and prints the status, so you can check it works
without waiting for a beat.

Free plan: cron triggers are included, and 480 pings/day is nothing against the 100k
requests/day allowance.

## The alternative, if you would rather not deploy a worker

Any external uptime monitor does the same job: create a monitor at
[cron-job.org](https://cron-job.org) or [UptimeRobot](https://uptimerobot.com) pointing at
`https://aquai-api.onrender.com/api/v1/health/db` (not plain `/health` — see above) on a
3-minute interval.

## Note on Render's free allowance

Keeping one service awake around the clock uses ~730 of the 750 free instance-hours per month.
That fits, but it leaves no headroom for a second free service on the same account. Render's
paid Starter plan (~$7/mo) removes the spin-down entirely and makes this worker unnecessary.
