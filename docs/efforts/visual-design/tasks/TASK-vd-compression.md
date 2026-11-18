# Team Lead -> Engineer Task Handoff

```yaml
id: TASK-vd-compression
revision: 1
effort: EFF-visual-design
project: economic-board-game
source_commit: 3ececec # main with handoff revision 3 (criterion 13)
owner: team-lead
status: proposed
```

## Outcome

Staging serves the client compressed over HTTP/2. This is the first PR for
criterion 13 (load performance) in `docs/efforts/visual-design.md` revision 3.

## Acceptance criteria

1. **Compression through the edge.** Through the staging edge, JS, CSS, SVG,
   JSON and HTML responses are compressed. Use gzip; add Brotli only if the
   stock nginx images support it without a custom build. Set a sensible
   `gzip_min_length`, set `gzip_vary on`, and keep immutable caching on
   `/assets/`. Images that are already compressed are not re-compressed.
2. **Protocols.** The edge serves HTTP/2 to browsers. It talks HTTP/1.1 to
   the web upstream, so the client nginx compresses for proxied requests.
   The `/ws` WebSocket upgrade and `/api/` proxying keep working.
3. **Deploy test through the edge.** A test in `deploy/tests/`
   (`check-edge.sh` and/or `test_deploy.py`) runs against the edge, not only
   the web container. It asserts `Content-Encoding` for a JS, CSS, SVG and
   JSON asset; HTTP/2 on 443; and that `/ws` upgrade and `/api/` still work.
   It must fail on the current config and pass on the new one. The
   evidence shows both runs.
4. **Staging evidence, before and after.** Compare against the TL baseline
   `/srv/agents/evidence/EFF-visual-design/load-baseline-80660e6.md`.
   Record transferred bytes for HTML, the app JS, CSS and one large logo.
   Record Lighthouse mobile metrics (LCP, TBT, and TTI if available) for
   login and for the game screen, before and after. Run Lighthouse from the
   Playwright/Chromium container, since the VM has no Chromium libraries.
   Capture the "after" figures once the change is deployed to staging (main
   auto-deploys). If staging does not re-render the edge config on deploy,
   escalate; do not change production.
5. **No other change.** No client code, no logo files, and no route split.
   Those belong to TASK-vd-load-split.

## Scope and non-goals

In scope:
- `deploy/edge/**` (`render.sh`, `nginx.conf`, compose and entrypoint as
  needed);
- `apps/client/nginx.conf`;
- `deploy/tests/**`;
- CI wiring for the edge test, if it does not already run;
- the OpenSpec change for the deploy and edge spec, if one exists.

Not in scope:
- client bundles and logos;
- a media service or CDN;
- production deploy, which stays with the owner.

## Canonical references

- `docs/efforts/visual-design.md` revision 3, criterion 13.
- The TL baseline evidence file above.

## Dependencies

Base: main 3ececec. Runs in parallel with TASK-vd-dialogs-followup.
TASK-vd-load-split follows.

## Required workflow

Explore -> Propose (OpenSpec change; `agentctl engineer report --wake`) ->
Team Lead approval -> Apply in a fresh context -> Verify -> PR -> start the
independent review yourself -> review fixes. Archive the OpenSpec change in
the PR once review passes.

## Required checks

- the deploy tests, plus `pnpm build` and `pnpm test` if touched;
- `openspec validate --all --strict`;
- `git diff --check <base> HEAD`;
- green CI (all four jobs) on the PR head;
- staging before and after evidence in
  `/srv/agents/evidence/TASK-vd-compression/`.

## Escalation conditions

- Staging edge config is not redeployed by the main pipeline.
- Any change that would require a production deploy or touch TLS
  certificates.

## Deliverables

- branch `agent/task-vd-compression`, the PR and CI evidence;
- the edge test output (failing before, passing after);
- the staging before and after table;
- the independent review report.

The Engineer accepts the exact revision before editing.
