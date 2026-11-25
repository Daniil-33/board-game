# Design: stage 6 client surfaces

Use the existing Feature-Sliced Design boundaries. Add view selectors in `entities/game`, user controls in features, and compose stage 6 surfaces in the game screen/dialog layer. Reuse the rent card for mandatory bank charge and the existing responsive `game-dialogs` pattern on mobile. Keep rendering and animations out of rules logic.

The server projection is authoritative. Derive jail fee and casino cap with the exported `jailFee` and `casinoCap` helpers, and gate controls using the same state precedence and availability constraints the core enforces. The casino amount selector uses only multiples of 10; public outcome events drive viewer animations. Chance labels map the four card ids to locale keys and include signed amount formatting.

Maintain stable `data-testid` hooks for downstream TASK-s6-e2e. Respect reduced motion and use only existing sounds. Desktop dialogs must fit without page scroll. On mobile, use the existing bottom-sheet pattern; the lack of a mobile design frame is documented as a deviation in the PR evidence.
