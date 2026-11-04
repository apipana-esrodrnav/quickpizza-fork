# QuickPizza — k6 workshop

A stripped-down fork of [grafana/quickpizza](https://github.com/grafana/quickpizza),
used as the system under test for a short, hands-on k6 workshop: **smoke vs load vs
spike testing**, and how to write k6 tests that actually tell you something.

> **Scope.** This is a k6 workshop. It does not teach Grafana, Prometheus or how to
> build custom metrics. Grafana and Prometheus are only here to make the results easier
> to see; everything they show is also in the summary k6 prints to the console. If you
> only read the console, you miss nothing.

## Try it yourself

You need [Docker](https://docs.docker.com/get-docker/) and
[k6](https://grafana.com/docs/k6/latest/set-up/install-k6/) (`brew install k6`). You do
not need Go or Node.

```bash
git clone https://github.com/apipana-esrodrnav/quickpizza-fork.git
cd quickpizza-fork
make up      # the first run downloads the images
```

Then follow [Running the tests](#running-the-tests).

## Performance testing is a family, not a test

Smoke, load and spike are all **performance tests**. They run the same user journey and
differ only in two things: **how much traffic** you send, and **what you expect** from
the system under that traffic.

| Test | Script | Traffic | Question it answers |
|---|---|---|---|
| **Smoke** | `k6/01-smoke.js` | 1 user, 30s | Does it work at all? |
| **Load** | `k6/02-load.js` | ramp to 10 users, ~2 min | Does it meet its targets on a normal day? |
| **Spike** | `k6/03-spike.js` | 5 → 100 → 5 users, ~2 min | Does it survive a sudden peak, and recover? |

Other members of the family (stress, soak, breakpoint) follow the same idea with
different shapes of traffic.

Compare the load and spike scripts — they are identical except for `stages` and
`thresholds`:

```bash
diff k6/02-load.js k6/03-spike.js
```

## Running the tests

```bash
make up      # QuickPizza + Postgres + Prometheus + Grafana
make smoke   # 30 seconds
make load    # ~2 minutes
make spike   # ~2 minutes
make fail    # the load test against a slowed-down app: thresholds go red
make down    # when you are finished
```

| | |
|---|---|
| QuickPizza | http://localhost:3333 |
| Grafana | http://localhost:3000 (no login) |
| Prometheus | http://localhost:9090 |

If a port is taken: `GRAFANA_PORT=3001 PROMETHEUS_PORT=9091 QUICKPIZZA_PORT=8080 make up`,
then `make smoke QUICKPIZZA_PORT=8080`.

## Two things that make a script a test

### Checks — was the answer right?

```js
check(res, {
  "status is 200": (r) => r.status === 200,
  "no Pepperoni": (r) => /* the recipe respects what we asked for */,
});
```

- A failing check **does not stop the test**. It is recorded and the run carries on.
- A status code alone is a weak assertion. A service can answer `200` quickly and still be
  wrong, so the scripts also check a business rule: we asked for no Pepperoni.

### Thresholds — pass or fail

```js
thresholds: {
  http_req_failed: ["rate<0.01"],                 // under 1% errors
  http_req_duration: ["p(95)<500", "p(99)<1000"], // latency, as percentiles
  checks: ["rate>0.99"],                          // over 99% of checks pass
}
```

If any threshold is crossed, k6 exits with **code 99** and your CI pipeline fails — no
extra scripting needed. Notice the targets change per test: the smoke test allows zero
errors, the spike test allows 5%.

Always use percentiles (`p(95)`), never the average: the average hides the slow
requests, and those are the ones users notice.

## Watching results in Grafana (optional)

The console summary is enough to follow the workshop. Grafana just draws the same
numbers over time.

```bash
make load K6_FLAGS="-o experimental-prometheus-rw"
```

Then open Grafana → **k6 Prometheus** and pick your run from the test-run dropdown.

No Docker? k6 has its own dashboard: `make load K6_FLAGS="--out web-dashboard"`.

## Cheat sheet

```bash
make load K6_FLAGS="--vus 50 --duration 1m"   # override the load profile
make load K6_FLAGS="--no-thresholds"          # measure without pass/fail
make smoke BASE_URL=https://my-env.example.com
```

`docs/inject-errors.md` lists other ways to make QuickPizza slow or flaky.
