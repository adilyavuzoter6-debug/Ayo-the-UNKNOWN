const HEALTH_URL = "https://aquai-api.onrender.com/api/v1/health";

export default {
  async scheduled(_event, _env, ctx) {
    ctx.waitUntil(
      fetch(HEALTH_URL, { headers: { "user-agent": "piscatio-keep-warm" } })
        .then((res) => console.log(`keep-warm: ${res.status}`))
        // A failed ping is not worth retrying — the next beat is 5 minutes away.
        .catch((err) => console.log(`keep-warm failed: ${err}`)),
    );
  },

  // Hitting the worker's own URL in a browser reports what it would do, so the deploy can be
  // sanity-checked without waiting for a scheduled run.
  async fetch() {
    const started = Date.now();
    const res = await fetch(HEALTH_URL, { headers: { "user-agent": "piscatio-keep-warm" } });
    return new Response(
      `target=${HEALTH_URL}\nstatus=${res.status}\nelapsed_ms=${Date.now() - started}\n`,
      { headers: { "content-type": "text/plain" } },
    );
  },
};
