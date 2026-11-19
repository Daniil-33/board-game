# Visual-design evidence capture

The capture set is split into app screenshots and design frames. App screenshots were produced by the browser runs recorded in the source task evidence READMEs; `collect-visual-screens.mjs` copies those durable screenshots, records each source task, and pairs them with the closest frame from the two HTML exports. It does not claim that a nearest-frame state is identical to the app state. Recreate the app source evidence first by following the relevant README in `TASK-vd-shell-pages`, `TASK-vd-game-layout`, `TASK-vd-game-dialogs`, and `TASK-vd-dialogs-followup` under `/srv/agents/evidence`, then run the collector.

Capture current design frames with the pinned browser container:

```sh
docker run --rm -v "$PWD":/workspace -v /srv/agents/evidence/TASK-vd-e2e/screens:/evidence -w /workspace mcr.microsoft.com/playwright:v1.58.2-noble node scripts/capture-design-frames.cjs /evidence/captured-design-frames
node scripts/collect-visual-screens.mjs /srv/agents/evidence /srv/agents/evidence/TASK-vd-e2e/screens
```

Capture staging-after Lighthouse and empty-cache transfer evidence with the approved task deployment version:

```sh
docker run --rm --network host -v "$PWD":/workspace -v /srv/agents/evidence/TASK-vd-load-split:/evidence -w /workspace mcr.microsoft.com/playwright:v1.58.2-noble node scripts/capture-staging-after.cjs
```

`capture-staging-after.cjs` requires `node_modules` mounted at `/workspace`, uses Playwright 1.58.2 and its bundled Chromium, and invokes exactly pinned Lighthouse 12.8.2 through `npx`. Set `STAGING_URL` to the staging origin when it differs from the default. It writes version, raw Lighthouse JSON and CDP request logs to `/evidence`; the manual before/after table is maintained in `staging-after.md`.
