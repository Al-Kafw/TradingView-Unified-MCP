# Sources and provenance

All source review applies to pinned commits. No upstream executable was run and no full upstream runtime is imported. See the detailed audit and retained notices.

| Repository | Commit | License / use |
|---|---|---|
| [FerroxLabs/tvcontrol](https://github.com/FerroxLabs/tvcontrol) | [a8d3dfc97621](https://github.com/FerroxLabs/tvcontrol/commit/a8d3dfc97621e22b8b7c71e617b134c5e35882ee) | MIT |
| [JostQQ/tradingview-mcp](https://github.com/JostQQ/tradingview-mcp) | [4d9b440935d5](https://github.com/JostQQ/tradingview-mcp/commit/4d9b440935d5e8b862ab61a72812adf801684564) | MIT |
| [pbajkovic-hub/tv-cdp-mcp](https://github.com/pbajkovic-hub/tv-cdp-mcp) | [dd0fd3c07ad1](https://github.com/pbajkovic-hub/tv-cdp-mcp/commit/dd0fd3c07ad10ea6151fc21aeff3791db7cb7219) | MIT |
| [firyomaefx/tradingview-chrome-mcp](https://github.com/firyomaefx/tradingview-chrome-mcp) | [d20f0acf7a2d](https://github.com/firyomaefx/tradingview-chrome-mcp/commit/d20f0acf7a2d888ef7fe9304178fae35c233c42c) | Unconfirmed: README claims MIT; no license or notice file in reviewed tree |
| [tradesdontlie/tradingview-mcp](https://github.com/tradesdontlie/tradingview-mcp) | [c05b8f5755ed](https://github.com/tradesdontlie/tradingview-mcp/commit/c05b8f5755ed8e64ea242de88ddbf46aa24d56a4) | MIT |
| [Chefy3x/tradingview-mcp-chefy](https://github.com/Chefy3x/tradingview-mcp-chefy) | [abcad6c6a49a](https://github.com/Chefy3x/tradingview-mcp-chefy/commit/abcad6c6a49a89a99f700abacffa2cdb61883fe7) | MIT |
| [iliaal/tradingview-mcp](https://github.com/iliaal/tradingview-mcp) | [233f29e18003](https://github.com/iliaal/tradingview-mcp/commit/233f29e180031291dacac4c4cc2736a8dde161be) | MIT |
| [daviddme/tradingview-alerts-mcp-server](https://github.com/daviddme/tradingview-alerts-mcp-server) | [5a61aa352c97](https://github.com/daviddme/tradingview-alerts-mcp-server/commit/5a61aa352c97403477052aead3a3dcab627c2dd0) | MIT |

## Primary protocol and platform references

- [MCP 2025-11-25 transport specification](https://modelcontextprotocol.io/specification/2025-11-25/basic/transports).
- [Chrome remote-debugging profile requirement](https://developer.chrome.com/blog/remote-debugging-port).
- [TradingView webhook configuration](https://www.tradingview.com/support/solutions/43000529348-how-to-configure-webhook-alerts/).
- [TradingView chart widget interface](https://www.tradingview.com/charting-library-docs/latest/api/interfaces/Charting_Library.IChartingLibraryWidget/). Its public library documentation informs interface interpretation; it does not guarantee TradingView Supercharts private API stability.

The audited native source files and blob hashes are fully recorded in docs/UPSTREAMS.json. Feature-level source links and declarations are in docs/UPSTREAM_FEATURES.md. Security-sensitive paths are cited in docs/UPSTREAM_SECURITY_REVIEW.md.
