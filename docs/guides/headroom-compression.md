# Context compression with Headroom

TaskPilot sends large prompts. A `summarize` run ships up to 3,000 characters
of page text; `extract_data` ships tables; the reasoner re-sends run state on
every step. `runtime/optimizer/token-optimizer.ts` already trims page context
by task type *before* a prompt is built — Headroom sits after that and
compresses the finished messages.

[Headroom](https://github.com/headroomlabs-ai/headroom) runs as a local proxy.
The API service POSTs its messages to `/v1/compress` and sends back whatever
the proxy returns. Compression itself happens on your infrastructure; no
prompt content leaves the box.

**It is off unless you configure it.** With `HEADROOM_BASE_URL` unset, no
wrapper is installed and prompts are sent exactly as before.

---

## 1. Run the proxy

Run it beside the API service — same host, same pod, or a Docker sidecar:

```bash
docker run -d --name headroom \
  -p 127.0.0.1:8787:8787 \
  ghcr.io/headroomlabs-ai/headroom:latest
```

Check it:

```bash
curl -s http://localhost:8787/health
```

### If the proxy is not on localhost

`POST /v1/compress` is restricted to loopback callers and answers everyone
else with **404** — deliberately, so it stays invisible to scanners. A proxy
on another host or pod therefore looks like a wrong URL rather than a blocked
one. To run it as a shared service you must set **both**:

```bash
HEADROOM_COMPRESS_ALLOW_REMOTE=1     # on the proxy — lets remote callers in
HEADROOM_PROXY_TOKEN=$(openssl rand -hex 32)
```

Never set the first without the second. The proxy's `/v1/*` data plane has no
authentication of its own, and it sees every prompt this service sends —
which includes whatever page content the user is acting on.

## 2. Point the API at it

In `services/api/.env`:

```bash
HEADROOM_BASE_URL=http://localhost:8787
HEADROOM_API_KEY=                # the HEADROOM_PROXY_TOKEN above, if set
HEADROOM_TIMEOUT_MS=2000         # optional
HEADROOM_MIN_TOKENS=2000         # optional
```

Restart. The startup banner names the proxy:

```
  headroom  compressing prompts via http://localhost:8787
```

## 3. Confirm it is working

`GET /health` reports what compression has done since the process started:

```json
{
  "compression": {
    "status": "configured",
    "attempts": 42,
    "compressed": 41,
    "failures": 1,
    "tokens_saved": 318204,
    "last_failure_reason": "timeout"
  }
}
```

`attempts` counts only prompts big enough to be worth compressing; anything
under `HEADROOM_MIN_TOKENS` skips the round trip and is not counted.

---

## How it behaves under failure

Compression **fails open**. If the proxy is down, slow, returns an error, or
returns a body we don't recognise, the original prompt is sent to the model
and the run continues. The cost of a broken proxy is tokens, never errors.

That is also the risk: a dead proxy is invisible from the outside. Two things
make it visible — the `failures` counter above, and a log line on the first
failure and every fiftieth after it:

```
[headroom] compression unavailable (http_404); sending prompts uncompressed. failures=1
  — a 404 from a remote proxy usually means HEADROOM_COMPRESS_ALLOW_REMOTE=1
    is not set on it; /v1/compress is loopback-only by default
```

| `last_failure_reason` | Meaning |
|---|---|
| `http_404` | Remote caller hitting a loopback-only `/v1/compress`. See above. |
| `http_401` | `HEADROOM_PROXY_TOKEN` is set on the proxy; put it in `HEADROOM_API_KEY`. |
| `timeout` | Proxy slower than `HEADROOM_TIMEOUT_MS`. Check its CPU — Kompress runs in-process. |
| `network_error:*` | Proxy unreachable: not running, wrong port, or firewalled. |
| `unexpected_response` | A 200 whose body we could not map back to our message shape — usually a proxy version we don't speak. Treated as an outage. |

## Where it plugs in

`ProviderRouter` wraps each provider once at construction
(`runtime/providers/index.ts`), so the planner, the reasoner and the
`/v1/ai/*` routes all get compression without knowing it exists. The wrapper
keeps the provider's `name` and `supports()`, so model routing is unchanged.

Responses carry a `compression` field with the per-request numbers; see
`CompressionStats` in `runtime/providers/types.ts`.

## Note on the npm SDK

Headroom publishes `headroom-ai`, a TypeScript client for the same two
endpoints. We talk to the proxy's HTTP API directly instead
(`runtime/providers/headroom.ts`, ~200 lines) to keep the backend's
dependency surface small and to control the fail-open behaviour ourselves.
The wire format is pinned by `headroom.test.ts`; if the proxy's contract
changes, those tests are what catch it.
