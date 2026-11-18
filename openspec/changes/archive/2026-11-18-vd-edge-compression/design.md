# Design

## Context

The public edge runs nginx 1.27-alpine from an independently pinned checkout. Its current TLS listeners do not enable HTTP/2 and its web proxy uses nginx's default HTTP/1.0. The client nginx only enables gzip for SVG in `/assets/`. Existing `deploy/tests/check-edge.sh` exercises bootstrap, TLS and host routing with absent apps, but it does not run an HTTP/2 client or validate compressed responses and live API/WebSocket proxying.

## Goals / Non-Goals

Enable gzip for the requested text MIME types at both nginx layers, negotiate HTTP/2 with browsers, and use HTTP/1.1 for the web upstream. Prove behavior through an isolated, disposable edge and record old-config failure plus new-config pass. Measure staging before now and after only when the CTO-coordinated edge update is complete.

Do not alter client code, logo files, route splitting, gameplay, production edge or certificates. Do not make the app deployment update the independently pinned edge.

## Decisions

- Configure gzip in each nginx `http`/`server` context for HTML, JavaScript, CSS, SVG and JSON, with a 256-byte minimum and `gzip_vary on`. This compresses the measured 562-byte staging HTML while avoiding compression of very small responses. Keep already-compressed image MIME types out of `gzip_types`; retain `/assets/` immutable caching.
- Configure HTTP/2 on TLS edge listeners using syntax supported by the pinned nginx 1.27 image. Set `proxy_http_version 1.1` on the web proxy while preserving explicit API and WebSocket routing.
- Extend the isolated deployment test with disposable fixture web and API upstreams on a private Docker network. Reuse the real edge renderer and client nginx configuration, self-signed test certificates, and an HTTP/2 capable test client. Leave the production app aliases absent to verify its HTTPS 502 response. Assert HTML/JS/CSS/SVG/JSON encoding and vary headers, immutable asset caching, no encoding for a compressed raster image, HTTP/2, API response and WebSocket 101. Retry the first TLS 502 probe briefly after reload to wait for listener readiness. Keep all test containers and networks private and clean them up on exit.
- Run the same test with the source edge files from the task base to capture an expected failure, then with the change to capture success. Do not point test traffic at the live shared edge.
- Capture before/after transferred bytes for HTML, app JS, CSS and one large logo, plus Lighthouse mobile LCP/TBT/TTI (where available) for login and a game screen. Lighthouse runs in the repository's Playwright Chromium container. The after pass waits for the CTO-coordinated staging-only shared edge operation.

## Risks / Trade-offs

- Nginx gzip MIME handling and `Vary` behavior can differ between local and proxied responses; the edge-level test checks actual response headers and protocol through the edge.
- HTTP/2 configuration syntax must work with the pinned nginx image; isolated `nginx -t` and the protocol assertion cover this.
- The shared edge remains at its old pinned SHA until the CTO coordinates its separate update. The implementation can be verified locally, but staging after-evidence and completion remain pending that operation.
