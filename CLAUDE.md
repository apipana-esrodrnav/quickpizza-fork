# CLAUDE.md

Guidance for Claude Code (claude.ai/code) when working in this repository.

## Project overview

A stripped-down fork of [grafana/quickpizza](https://github.com/grafana/quickpizza) used
as the system under test for a k6 workshop. QuickPizza is a demo web app that generates
pizza recommendations: Go backend, SvelteKit frontend embedded in the binary.

**This fork is deliberately minimal.** Upstream's browser tests, xk6 extensions, gRPC
and WebSocket examples, Kubernetes manifests, Terraform, and the Alloy/Tempo/Loki/
Pyroscope/OBI telemetry pipeline have all been removed. Do not reintroduce them. If a
task seems to need them, it probably belongs upstream.

The workshop covers exactly three test types — smoke, load, spike — plus checks, custom
metrics and thresholds. Keep additions in that scope.

## Key commands

```bash
make up      # QuickPizza + Postgres + Prometheus + Grafana (published image, no build)
make down
make smoke   # k6/01-smoke.js   1 VU, 30s
make load    # k6/02-load.js    ramp to 10 VUs, ~2m
make spike   # k6/03-spike.js   peak of 100 VUs, ~2m
make fail    # k6/02-load.js with an injected delay, so thresholds go red (exit 99)
make help    # every target
```

Extra k6 flags go through `K6_FLAGS`, e.g.
`make load K6_FLAGS="-o experimental-prometheus-rw"`.

Host ports are overridable: `QUICKPIZZA_PORT`, `PROMETHEUS_PORT`, `GRAFANA_PORT`
(defaults 3333 / 9090 / 3000). `BASE_URL` follows `QUICKPIZZA_PORT`, and
`K6_PROMETHEUS_RW_SERVER_URL` follows `PROMETHEUS_PORT`.

Building the app itself requires Go and Node, which the workshop does not:

```bash
make build        # frontend + backend
make build-go     # backend only
make test-go
make format       # goimports + biome
make format-check
```

## Architecture

- `cmd/` — entrypoint; everything listens on `:3333`.
- `pkg/http/` — HTTP server and all route handlers. `POST /api/pizza` (the endpoint the
  workshop load-tests) is at `pkg/http/http.go:1352`; recipe generation is the
  `for range 10` loop around `pkg/http/http.go:1479`.
- `pkg/database/` — Bun ORM over SQLite or PostgreSQL, migrations included.
- `pkg/model/` — Pizza, User, Ingredient.
- `pkg/web/` — SvelteKit frontend, embedded via `//go:embed all:build`. This means
  `pkg/web/build/` must exist for the Go build to succeed; `make build-go` creates it
  from `pkg/web/dev.html`.
- `pkg/errorinjector/` — header-driven fault injection.
- `k6/` — the three workshop scripts. Each is self-contained (plain `http.post` +
  `check`, no shared modules) so it reads top to bottom on a projector.
  `02-load.js` and `03-spike.js` are identical except for `stages` and `thresholds`;
  keep it that way, a diff between them is part of the talk.

The app can run as a modular monolith or as separate services via
`QUICKPIZZA_ENABLE_*_SERVICE` env vars, but this fork only ever runs the monolith
(`QUICKPIZZA_ENABLE_ALL_SERVICES=1`).

## Things worth knowing

**Auth.** `POST /api/pizza` requires a token, but any 16-character value works —
`Catalog.Authenticate` falls back to user id 1 (`pkg/database/catalog.go:266`). The
scripts use `abcdef0123456789`.

**Restrictions are matched exactly.** `excludedIngredients` / `excludedTools` compare
against names case-sensitively, so `"pepperoni"` excludes nothing while `"Pepperoni"`
works. The API accepts both silently.

**The calorie cap is best-effort.** Recipe generation retries at most 10 times and then
returns the over-budget pizza anyway, so `calories <= maxCaloriesPerSlice` holds about
99.6% of the time on a healthy system. That is why the scripts deliberately have **no
calorie check** (it would make `checks: rate==1` in the smoke test fail about one run in
ten), and why the `pizza_calories` threshold is `p(99)<=500`, not `max<=500`: the metric
records every pizza returned, including the over-budget ones.

**Database.** `compose.yaml` uses PostgreSQL deliberately. The default in-memory SQLite
serialises writes, which produces lock errors at the spike test's 100 VUs that look like
application failures.

## Fault injection

Used in the workshop finale to force a threshold breach. `make fail` does it per request,
with no restart: it passes `-e DELAY=200ms`, which the load/spike scripts turn into an
`x-delay-get-ingredients` header (~0.9-1.2s per request, because ingredients are fetched
several times per pizza). `x-delay-record-recommendation` has no visible effect on
`POST /api/pizza` with the published image — do not switch to it.

Process-wide alternatives, set on the `quickpizza` service in `compose.yaml` (commented
examples are already there):

- `QUICKPIZZA_DELAY_RECOMMENDATIONS_API_PIZZA_POST` — delay `POST /api/pizza`
- `QUICKPIZZA_FAIL_RATE_RECOMMENDATIONS_API_PIZZA_POST` — fail 0-100% with a 503
- `QUICKPIZZA_PUBLIC_API_TIMEOUT` — return 503 past this deadline

Per-request headers (`x-error-*`, `x-delay-*`, with `-percentage` suffixes) also work.
Full list in `docs/inject-errors.md`.

## Observability

Just Prometheus and Grafana. `deployments/observability/prometheus.yaml` accepts k6
remote-write and scrapes the app's own `/metrics`; the two "k6 Prometheus" dashboards are
provisioned from `deployments/observability/grafana/`. There is no tracing, logging or
profiling backend in this fork.
