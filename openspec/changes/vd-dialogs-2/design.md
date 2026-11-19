# Design

Keep the existing view-driven components and command handlers. Reorganize their DOM hierarchy and apply existing design tokens so structure follows the frames without changing action eligibility, payloads, deadlines, or projection-derived values.

- Purchase: gradient/logo header, category/group metadata, price/rent tiles, other group ownership, post-purchase balance when affordable, emphasized Buy and secondary Start auction, timeout note. Post-purchase balance is the exact projected balance minus the fixed asset price under `purchase-auction.ts:131-134`; show the existing insufficient-funds reason instead when unaffordable.
- Auction: prominent leading bid with start/step, leader, ordered response queue with passed/leading/current responder states, deadline progress, primary bid and secondary pass, and irrevocable-pass note. Queue state follows the current projection.
- Asset: brand/category/price header, group-member chips with owner and houses, rent schedule with the current projected tier highlighted, house-cost/mortgage tiles, styled existing controls with their existing reason strings.
- Rent/debt: payer, payee, asset, rent, projected shortfall, supported manage-assets entry, and supplied automatic liquidation steps/summary. Do not create a new settlement action.
- Elimination and game over: compare elimination surface to its frame; use one title, winner emphasis, elimination rows, final balances, and existing actions. Use initials in seat-color badges as the documented avatar-data deviation.
- Temporary jail status: restyle only the existing projected attempt count as a compact “In jail · n/3” status; do not add actions or the final jail state.
- Shell: change the shared shell heading and document title to the accepted product-name key; retain the existing top-bar product name.

Keep responsive dialog/sheet behavior and current focus handling. Use existing design tokens; do not modify token values. Keep test ids stable. Update the `client/game-screen` delta only for visual content that extends current projection-backed display requirements.
