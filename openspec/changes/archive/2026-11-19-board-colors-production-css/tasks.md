## 1. CSS color parsing

- [x] 1.1 Add a pure parser for hex, `rgb()`/`rgba()` comma and space syntax, and named CSS colors, and use it for group and special gradients; add unit cases for each syntax and the exact minified token strings.
- [x] 1.2 Add a built-CSS check that fails when any emitted `--group-*` or `--gradient-board-*` token yields fewer than two colors.

## 2. Production browser evidence

- [x] 2.1 Add a production-stack browser check that samples one group strip and one special-cell corner and asserts neither equals its fallback color.
- [x] 2.2 Capture desktop and mobile production board screenshots alongside the existing board evidence.
