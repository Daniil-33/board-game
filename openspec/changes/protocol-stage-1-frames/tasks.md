# Tasks

## 1. Package scaffold (spec: protocol/frames "Protocol version")

- [ ] 1.1 Create `packages/protocol` (`@game/protocol`): `package.json` (dep
  `@sinclair/typebox` ^0.34, type-only dep `@game/game-core` workspace),
  `tsconfig.json`, `vitest.config.ts`, `src/index.ts` with `PROTOCOL_VERSION`.
  Update `pnpm-lock.yaml`. Verify: `pnpm install --frozen-lockfile`,
  `pnpm build`.

## 2. Frames (spec: protocol/frames)

- [ ] 2.1 `src/common.ts`: branded id schemas, `Expectation`, error codes
  (design D4, D7). Verify with vitest table cases.
- [ ] 2.2 `src/frames.ts`: client and server frame schemas, closed objects,
  `view`/`events` typed from game-core with interim-jail description, command
  stub union (design D2, D5, D6). Verify: round trip of every frame; extra
  field and client `actor` rejection.
- [ ] 2.3 `src/decode.ts`: total `decodeClientFrame` / `decodeServerFrame`
  (design D3). Verify: hostile-string table never throws, wrong-direction
  frames rejected.

## 3. Lobby (spec: protocol/lobby)

- [ ] 3.1 `src/nickname.ts`: `isValidNickname`, `normalizeNickname`,
  `NICKNAME_FORMAT`, TypeBox format registration (design D8). Verify bounds
  with astral characters, trim, control/format characters.
- [ ] 3.2 `src/lobby.ts`: request/response schemas for login, create, list,
  join, start. Verify valid samples pass and extra fields fail.

## 4. Verify

- [ ] 4.1 `pnpm install --frozen-lockfile`, `pnpm build`, `pnpm test`,
  `git diff --check`; Team Lead confirms command names/payloads before merge.
