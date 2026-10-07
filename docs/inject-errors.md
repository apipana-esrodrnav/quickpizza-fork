# Injecting delays and errors

A load test that always passes teaches nothing. QuickPizza can be made slow or
flaky on demand, so you can show a threshold actually failing.

There are two mechanisms: environment variables (process-wide) and HTTP headers
(per request).

## Environment variables

Set these on the `quickpizza` service in [`compose.yaml`](../compose.yaml), then
`make up` again. Delays are Go duration strings (`500ms`, `2s`, `1.5s`).

The three used in the workshop:

| Variable | Effect |
|---|---|
| `QUICKPIZZA_DELAY_RECOMMENDATIONS_API_PIZZA_POST` | Adds a fixed delay to `POST /api/pizza`. Breaks the `http_req_duration` threshold. |
| `QUICKPIZZA_FAIL_RATE_RECOMMENDATIONS_API_PIZZA_POST` | Fails this percentage (0-100) of pizza requests with a 503. Breaks `http_req_failed` and `checks`. |
| `QUICKPIZZA_PUBLIC_API_TIMEOUT` | Wraps the API in a timeout; returns 503 when it fires. Combine with a delay larger than the timeout. |

The workshop finale uses `make fail` instead (see below), which needs no restart.
Alternatively, `QUICKPIZZA_DELAY_RECOMMENDATIONS_API_PIZZA_POST=800ms` makes
`make load` breach `p(95)<500` and exit with code 99, while the app itself stays
perfectly healthy — a good illustration of why a threshold is a decision, not a
measurement.

Others available:

- `QUICKPIZZA_DELAY_RECOMMENDATIONS` — all recommendation endpoints
- `QUICKPIZZA_DELAY_RECOMMENDATIONS_API_PIZZA_GET` — `GET /api/pizza/{id}`
- `QUICKPIZZA_DELAY_COPY`, `..._API_QUOTES`, `..._API_NAMES`, `..._API_ADJECTIVES`
- `QUICKPIZZA_DELAY_FRONTEND_CSS_ASSETS`, `QUICKPIZZA_DELAY_FRONTEND_PNG_ASSETS`
- `QUICKPIZZA_FAIL_RATE_CATALOG_DATABASE_RECORD_RECOMMENDATION` — fails that
  percentage of `RecordRecommendation` database calls with a real PostgreSQL
  error. Requires the Postgres backend, which `compose.yaml` already uses.

## HTTP headers

Per-request, so you can inject faults from inside a k6 script without
restarting anything — add them to `headers` in the k6 script. `make fail` does exactly
this: `k6/02-load.js` sends `x-delay-get-ingredients` when run with `-e DELAY=200ms`.
Ingredients are fetched several times per pizza, so 200ms becomes roughly 1s per request.
(`x-delay-record-recommendation` has no visible effect on `POST /api/pizza`.)

| Header | Value |
|---|---|
| `x-error-record-recommendation` | error message to raise when recording a recommendation |
| `x-error-get-ingredients` | error message to raise when retrieving ingredients |
| `x-delay-record-recommendation` | delay duration, e.g. `250ms` |
| `x-delay-get-ingredients` | delay duration |

Append `-percentage` to any of the above with a value of 0-100 to make it
probabilistic:

```shell
curl -X POST http://localhost:3333/api/pizza \
     -H "Content-Type: application/json" \
     -H "Authorization: token abcdef0123456789" \
     -H "x-error-record-recommendation: internal-error" \
     -H "x-error-record-recommendation-percentage: 20" \
     -d '{}'
```
