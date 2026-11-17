# Client localization

The browser calls `registerLocales()` before constructing the client. Vite eagerly
discovers `locales/*.json`; adding a locale needs no registry edit. The test setup
uses the same registration. Registration is deferred so Node browser-test tooling
can import the board's public geometry API without executing Vite-only discovery.
English is the default and fallback; Russian is an empty skeleton for the tokens
task. There is no language selector or stored preference yet.

Keys are dotted semantic names grouped by screen, widget or presentation adapter.
Use complete messages and semantic interpolation parameters such as `player`,
`amount`, `asset` and `diceSum`. Rich text uses explicitly imported `i18n-t`
with named slots (and the shared Composer), preserving markup while allowing
translations to reorder the complete sentence. Conditional sentence variants
use separate complete keys. List items are translated before joining separators. House and mortgage
reason keys are `reasons.house.CODE` and `reasons.mortgage.CODE`; typed getter maps
preserve their public error-code lookup and follow the active locale. Always use
literal keys in `t()` calls so the parser-based inventory can compare used and
defined keys exactly. Do not construct keys dynamically. Preserve the existing
English text, punctuation and visible whitespace, including conditional phrases.

Catalog names and groups, user names, received server text, protocol codes,
CSS classes, URLs, HTTP authorization headers, DOM/Pixi identifiers and developer
diagnostics are data or implementation literals, not translations. Raw-text lint
checks template text and accessibility/title/placeholder/alt attributes. Parser-based
ESLint selectors also reject prose in TS/script setup, raw Pixi captions, and raw
values in presentation variables/reason maps. Imports, console diagnostics and
ordinary Error/RangeError diagnostics are narrow implementation exceptions.
Technical codes and terse data still require review when they could be UI labels. Key lint
checks Vue and TypeScript calls against English; the inventory unit test includes
template expressions, TypeScript, typed map getters and static/conditional
`i18n-t` keypaths. Known Pixi banners carry a full-caption function so names
are resolved at playback without joining translated predicates. The empty Russian file
is intentionally excluded from complete translation parity.

Money and times use `shared/lib/format`, preserving ungrouped integer amounts and
the existing UTC timestamp layout. Arithmetic remains in game-core.
