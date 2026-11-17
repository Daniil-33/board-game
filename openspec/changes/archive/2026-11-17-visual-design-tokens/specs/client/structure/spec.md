## MODIFIED Requirements

### Requirement: Enforced client boundaries
The client SHALL use app, pages, widgets, features, entities and shared layers in descending dependency order. Cross-slice imports SHALL target public index.ts APIs and SHALL target lower layers only. Shared consists of segments rather than slices: Shared segments MAY import other shared segments through their public index.ts APIs. shared/i18n SHALL import no other Shared segment, and Shared dependencies SHALL remain acyclic. CI SHALL reject violations, including type-only imports.

#### Scenario: Forbidden dependency
- **WHEN** a lower layer imports a higher layer or an import crosses a slice through a private file
- **THEN** the client boundary check fails

#### Scenario: Internal slice dependency
- **WHEN** a module imports another module within its own slice
- **THEN** relative private imports are permitted

#### Scenario: Shared segment cycle rejected
- **WHEN** shared/i18n imports shared/lib (the reverse of the permitted formatting dependency)
- **THEN** the boundary check fails, including for a type-only import

#### Scenario: Re-export or dynamic import violation
- **WHEN** a re-export targets a private cross-slice file or a dynamic import targets a higher layer
- **THEN** the client boundary check rejects the dependency
