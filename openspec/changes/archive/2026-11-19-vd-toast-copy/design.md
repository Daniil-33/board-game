# Design

One shared client presentation helper maps every protocol client command type to its localized title and resolves the existing client-owned reason mappings. HUD rejections without a command type use a generic localized title. The server message is not used for visible copy. Unknown reasons use the localized retry message. Both toast and HUD retain `data-code` attributes.

The reconnect banner and offline HUD status use the same two locale keys. Screenshot capture writes per-screen producer metadata alongside the captures; the collector compares the recorded producer head with its checkout before copying the affected evidence.

No core, protocol, server, layout, or design-token changes are required.
