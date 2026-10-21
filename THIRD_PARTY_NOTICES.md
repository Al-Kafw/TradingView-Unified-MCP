# Third-party notices

This project is a separately authored, browser-only MCP implementation. Its TradingView integration uses API patterns and workflow ideas examined in the repositories below. Upstream servers, dependency trees, binary releases, telemetry systems, credential loaders and desktop launchers are not included as runtime components.

The full notices below are retained conservatively for adapted logic and inherited API patterns. They do not imply that these authors reviewed, endorsed or maintain this project. For exact reviewed revisions and decisions, see [docs/UPSTREAMS.json](docs/UPSTREAMS.json) and [docs/UPSTREAM_SECURITY_REVIEW.md](docs/UPSTREAM_SECURITY_REVIEW.md).

## References and adaptation decisions

| Repository | Reviewed commit | Attribution and disposition |
| --- | --- | --- |
| [FerroxLabs/tvcontrol](https://github.com/FerroxLabs/tvcontrol) | [a8d3dfc97621](https://github.com/FerroxLabs/tvcontrol/commit/a8d3dfc97621e22b8b7c71e617b134c5e35882ee) | Selected API patterns independently reimplemented; do not import upstream modules. |
| [JostQQ/tradingview-mcp](https://github.com/JostQQ/tradingview-mcp) | [4d9b440935d5](https://github.com/JostQQ/tradingview-mcp/commit/4d9b440935d5e8b862ab61a72812adf801684564) | Selected report/metadata patterns independently reimplemented; no upstream runtime/dependencies imported. |
| [pbajkovic-hub/tv-cdp-mcp](https://github.com/pbajkovic-hub/tv-cdp-mcp) | [dd0fd3c07ad1](https://github.com/pbajkovic-hub/tv-cdp-mcp/commit/dd0fd3c07ad10ea6151fc21aeff3791db7cb7219) | Selected native layout-copy and internal service patterns independently reimplemented with stricter validation. |
| [firyomaefx/tradingview-chrome-mcp](https://github.com/firyomaefx/tradingview-chrome-mcp) | [d20f0acf7a2d](https://github.com/firyomaefx/tradingview-chrome-mcp/commit/d20f0acf7a2d888ef7fe9304178fae35c233c42c) | No source reuse: license file absent in pinned tree and root package has no license field. |
| [tradesdontlie/tradingview-mcp](https://github.com/tradesdontlie/tradingview-mcp) | [c05b8f5755ed](https://github.com/tradesdontlie/tradingview-mcp/commit/c05b8f5755ed8e64ea242de88ddbf46aa24d56a4) | Original upstream attribution retained for shared API patterns inherited through forks. |
| [Chefy3x/tradingview-mcp-chefy](https://github.com/Chefy3x/tradingview-mcp-chefy) | [abcad6c6a49a](https://github.com/Chefy3x/tradingview-mcp-chefy/commit/abcad6c6a49a89a99f700abacffa2cdb61883fe7) | Feature ideas only in current design; preserve attribution if any source is later adapted. |
| [iliaal/tradingview-mcp](https://github.com/iliaal/tradingview-mcp) | [233f29e18003](https://github.com/iliaal/tradingview-mcp/commit/233f29e180031291dacac4c4cc2736a8dde161be) | Public scanner/hotlist API patterns independently reimplemented; cookie-bearing watchlist and outside RSS paths excluded. |
| [daviddme/tradingview-alerts-mcp-server](https://github.com/daviddme/tradingview-alerts-mcp-server) | [5a61aa352c97](https://github.com/daviddme/tradingview-alerts-mcp-server/commit/5a61aa352c97403477052aead3a3dcab627c2dd0) | Data-only payload-construction ideas independently reimplemented; credential/config/HTTP layer excluded. |

## Ferrox Labs — tvcontrol

Source: [LICENSE](https://github.com/FerroxLabs/tvcontrol/blob/a8d3dfc97621e22b8b7c71e617b134c5e35882ee/LICENSE).

```text
MIT License

Copyright (c) 2026 Ferrox Labs

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

---

ADDITIONAL NOTICE: This software is not affiliated with, endorsed by, or
associated with TradingView Inc. Users are solely responsible for ensuring
their use complies with TradingView's Terms of Use and all applicable laws.
This license applies to the source code of this project only and does not
grant any rights to TradingView's software, data, or intellectual property.

TRADEMARK NOTICE

The MIT license above applies to the source code in this repository only.
It does not grant any rights to the trademarks, logos, or intellectual
property of TradingView Inc. All such marks are the property of their
respective owners.
```

## tradesdontlie — original tradingview-mcp

This original notice also covers the upstream portions credited in JostQQ/tradingview-mcp and in the reviewed forks. JostQQ ships this same original notice in LICENSE-tradingview-mcp-original.txt. Both links are retained: [original LICENSE](https://github.com/tradesdontlie/tradingview-mcp/blob/c05b8f5755ed8e64ea242de88ddbf46aa24d56a4/LICENSE) and [JostQQ original notice](https://github.com/JostQQ/tradingview-mcp/blob/4d9b440935d5e8b862ab61a72812adf801684564/LICENSE-tradingview-mcp-original.txt).

```text
MIT License

Copyright (c) 2026 tradesdontlie

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

---

ADDITIONAL NOTICE: This software is not affiliated with, endorsed by, or
associated with TradingView Inc. Users are solely responsible for ensuring
their use complies with TradingView's Terms of Use and all applicable laws.
This license applies to the source code of this project only and does not
grant any rights to TradingView's software, data, or intellectual property.

TRADEMARK NOTICE

The MIT license above applies to the source code in this repository only.

It does not grant any rights to the trademarks, logos, or intellectual
property of TradingView Inc. or Anthropic, PBC. All such marks are the
property of their respective owners.
```

## TV_MCP contributors — JostQQ/tradingview-mcp

Source: [LICENSE](https://github.com/JostQQ/tradingview-mcp/blob/4d9b440935d5e8b862ab61a72812adf801684564/LICENSE). The original upstream notice it references is included immediately above.

```text
MIT License

Copyright (c) 2026 TV_MCP contributors

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

---

Portions of this software are derived from tradingview-mcp
(https://github.com/tradesdontlie/tradingview-mcp), MIT licensed — see
LICENSE-tradingview-mcp-original.txt for the original copyright notice.

This software is not affiliated with, endorsed by, or associated with TradingView
Inc. Users are solely responsible for ensuring their use complies with TradingView's
Terms of Use and all applicable laws.
```

## pbajkovic-hub — tv-cdp-mcp

Source: [LICENSE](https://github.com/pbajkovic-hub/tv-cdp-mcp/blob/dd0fd3c07ad10ea6151fc21aeff3791db7cb7219/LICENSE).

```text
MIT License

Copyright (c) 2026 pbajkovic-hub

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

## DaviddTech — tradingview-alerts-mcp-server

Source: [LICENSE](https://github.com/daviddme/tradingview-alerts-mcp-server/blob/5a61aa352c97403477052aead3a3dcab627c2dd0/LICENSE). Only payload-construction concepts are relevant; the cookie credential loader and HTTP transport are excluded.

```text
MIT License

Copyright (c) 2026 DaviddTech

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

## Additional feature references

### Chefy3x/tradingview-mcp-chefy

The current integration uses feature ideas only. This full notice is retained in case the in-browser aggregation patterns are adapted. Chefy credits LewisWJackson/tradingview-mcp-jackson and tradesdontlie/tradingview-mcp in its NOTICE.md.

```text
MIT License

Copyright (c) 2026 tradesdontlie
Copyright (c) 2026 Chefy

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

```text
# Notices

## Third-party trademarks

This software is not affiliated with, endorsed by, or associated with
TradingView Inc. Users are solely responsible for ensuring their use complies
with TradingView's Terms of Use and all applicable laws. The MIT license
covers the source code of this project only and does not grant any rights to
TradingView's software, data, or intellectual property.

The MIT license likewise does not grant any rights to the trademarks, logos,
or intellectual property of TradingView Inc. or Anthropic, PBC. All such
marks remain the property of their respective owners.

## Upstream credits

This project is a fork of [LewisWJackson/tradingview-mcp-jackson][lewis], which
itself is a fork of [tradesdontlie/tradingview-mcp][tdl]. The CDP probing and
known-paths discovery work was done by tradesdontlie; Lewis Jackson added the
morning-brief workflow and pine tooling. This fork focuses on token-efficient
backtest reads via in-browser aggregation.

[lewis]: https://github.com/LewisWJackson/tradingview-mcp-jackson
[tdl]: https://github.com/tradesdontlie/tradingview-mcp
```

### iliaal/tradingview-mcp

Feature ideas only. Its reviewed LICENSE is the original tradesdontlie MIT notice reproduced above. The raw-cookie extraction and Node authentication implementation is expressly excluded. Source: [LICENSE](https://github.com/iliaal/tradingview-mcp/blob/233f29e180031291dacac4c4cc2736a8dde161be/LICENSE).

### firyomaefx/tradingview-chrome-mcp

No source is reused from this repository. Its README carries an MIT claim, but the reviewed tree at d20f0acf7a2d888ef7fe9304178fae35c233c42c contains no LICENSE or NOTICE file and its root package manifest declares no license. A README badge is insufficient provenance for importing implementation. Browser workflow ideas may be independently implemented without copying its source; any future source reuse requires license provenance to be resolved first.

## TradingView and other marks

TradingView is a third-party service. These open-source notices grant rights in the referenced source code only. They do not grant rights to TradingView software, services, market data or trademarks. No affiliation or endorsement is claimed.
