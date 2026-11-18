## 1. Nginx delivery

- [x] 1.1 Configure the public edge for HTTP/2 on HTTPS, HTTP/1.1 to the web upstream, gzip for HTML/JS/CSS/SVG/JSON with a 256-byte minimum and `Vary`, while preserving host routing, HSTS, immutable asset caching and existing `/api/` and `/ws` behavior (`deployment/public`).
- [x] 1.2 Configure the client nginx to gzip HTML/JS/CSS/SVG/JSON, preserve immutable `/assets/` caching, and exclude already-compressed image formats (`deployment/compose`).

## 2. Edge test

- [x] 2.1 Extend `deploy/tests/check-edge.sh` with private fixture web/API upstreams and an HTTP/2-capable client. Assert compressed HTML, JS, CSS, SVG and JSON, HTTP/2, HTTP/1.1 web upstream, unchanged compressed raster response, immutable caching, absent-environment 502, `/api/` response and `/ws` upgrade (`deployment/public`, `deployment/compose`).
- [x] 2.2 Run the test against task-base edge configuration and capture the expected failure; run it against the new configuration and capture success. Ensure all disposable containers and network resources are removed.

## 3. Staging evidence and verification

- [x] 3.1 Capture before staging transferred bytes for HTML, app JS, CSS and one large logo, plus Lighthouse mobile LCP/TBT/TTI where available for login and game screen; use the Playwright Chromium container and save evidence under `/srv/agents/evidence/TASK-vd-compression/`.
- [ ] 3.2 After the CTO-coordinated staging-only edge update, capture the matching after measurements and compare them to the baseline. Do not perform a shared-edge operation or change production.
- [ ] 3.3 Run deploy tests, `pnpm build`, `pnpm test`, strict OpenSpec validation and diff checks. Record CI and review evidence with the final PR.
