# Keep-warm worker

Pings the API's health endpoint every 5 minutes so Render's free plan never spins the
service down (15 minutes idle → ~50-90s cold start on the next real visit).

This exists because `.github/workflows/keep-api-warm.yml` does **not** work: GitHub throttles
scheduled workflows on shared runners hard — measured 2026-09-28, it ran ~12 times a day at
2-6 hour gaps instead of the 144 the `*/10` schedule asks for. Cloudflare runs cron triggers
on its own scheduler, so a 5-minute beat is actually a 5-minute beat.

## Deploy (one time, ~2 minutes)

```bash
cd ops/keep-warm-worker
npx wrangler login      # opens a browser, authorises the Cloudflare account that holds the domain
npx wrangler deploy
```

Then confirm it is scheduled: Cloudflare dashboard → Workers & Pages → `piscatio-keep-warm` →
Settings → Triggers → Cron Triggers should list `*/5 * * * *`. Visiting the worker's own
`*.workers.dev` URL runs the ping immediately and prints the status, so you can check it works
without waiting for a beat.

Free plan: cron triggers are included, and 288 pings/day is nothing against the 100k
requests/day allowance.

## The alternative, if you would rather not deploy a worker

Any external uptime monitor does the same job: create a monitor at
[cron-job.org](https://cron-job.org) or [UptimeRobot](https://uptimerobot.com) pointing at
`https://aquai-api.onrender.com/api/v1/health` on a 5-minute interval.

## Note on Render's free allowance

Keeping one service awake around the clock uses ~730 of the 750 free instance-hours per month.
That fits, but it leaves no headroom for a second free service on the same account. Render's
paid Starter plan (~$7/mo) removes the spin-down entirely and makes this worker unnecessary.
