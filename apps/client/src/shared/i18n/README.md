# Client localization

The browser calls `registerLocales()` before constructing the client. Vite eagerly
discovers `locales/*.json`; adding a locale needs no registry edit. The test setup
uses the same registration. Registration is deferred so Node browser-test tooling
can import the board's public geometry API without executing Vite-only discovery.
English is the default and fallback; Russian is an empty skeleton for the tokens
task. There is no language selector or stored preference yet.

Keys are dotted semantic names grouped by screen, widget or presentation adapter.
Use complete messages and named interpolation parameters. House and mortgage
reason keys are `reasons.house.CODE` and `reasons.mortgage.CODE`; typed getter maps
preserve their public error-code lookup and follow the active locale. Always use
literal keys in `t()` calls so the parser-based inventory can compare used and
defined keys exactly. Do not construct keys dynamically. Preserve the existing
English text, punctuation and visible whitespace, including conditional phrases.

Catalog names and groups, user names, received server text, protocol codes,
CSS classes, URLs, HTTP authorization headers, DOM/Pixi identifiers and developer
diagnostics are data or implementation literals, not translations. Raw-text lint
checks template text and accessibility/title/placeholder/alt attributes. Key lint
checks Vue and TypeScript calls against English; the inventory unit test includes
template expressions, TypeScript and typed map getters. The empty Russian file
is intentionally excluded from complete translation parity.

Money and times use `shared/lib/format`, preserving ungrouped integer amounts and
the existing UTC timestamp layout. Arithmetic remains in game-core.
