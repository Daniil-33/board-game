## Why

Ship the owner's v2 brand icons with the commissioned geometric set available as a runtime fallback.

## What Changes

- Keep both validated sets as catalog data and preserve the light and dark variants.
- Provide a client URL resolver and select its set at container startup.
- Serve hashed SVGs with gzip and immutable caching.

## Capabilities

- New catalog and client logo contracts.
- Extend the deployment runtime configuration and client delivery contracts.

## Impact

No board or panel rendering, catalog identities, or game rules change. GAME-BREAKDOWN.md § «Участники и поле» and § «Архитектурные контракты» are unaffected. Trademark review and production deployment are outside this change.
