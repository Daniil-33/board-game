# Design

## Context
See proposal.md. TASK-vd-logos-set revision 1 supersedes earlier optional-dark and scraped-source wording.

## Goals / Non-Goals
Preserve supplied bytes and provenance. No artwork edits, previews, client changes or engine imports.

## Decisions
Copy only supplied logos/*.svg and FONT-LICENSE.txt. Generate the five-field manifest from supplied monograms, using fixed id-based filenames. Require exactly 134 regular SVG files plus manifest, README and license. Keep the existing narrow SVG allowlist and local-reference validation; allow passive role and aria-label attributes used by supplied files. Require the root viewBox to be 0 0 64 64. Remove obsolete PNG validation because every assigned asset is SVG. A directory-scoped .gitattributes marks FONT-LICENSE.txt -whitespace so git diff --check passes while the upstream license (which has trailing spaces) stays byte-identical.

## Risks / Trade-offs
Accidental artwork alteration → compare source and destination SHA256 values for every copied file and save evidence outside Git. Unsafe SVG content → preserve restrictive validation and adversarial cases. Rendering integration remains with TASK-vd-board.
