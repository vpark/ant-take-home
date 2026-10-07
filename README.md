# Claude File Search: mock API docs

This folder is a static, single-page mock of Claude Platform documentation for a proposed **File Search** feature. It was made for a product take-home assignment and is AI-generated. It is not Anthropic documentation and describes no live API.

Open `docs/en/agents-and-tools/tool-use/file-search-tool/`; the root `index.html` links to it, and the page links back to the root.

## What is real and what is designed

- **Designed for the proposal:** the Collections API (`/v1/collections` and its documents), the `file_search_20261005` tool, its `file_search_tool_result` block, the `file-search-2026-10-05` beta header, limits, and pricing.
- **Existing Claude APIs it builds on:** the Files API, the Messages API and server tools, and `search_result` blocks with `search_result_location` citations.

A banner identifies the take-home and its author. The feature carries "Beta" badges. Links and controls that would leave the page open a dialog first; "Open actual page" goes to the live Claude docs.

## Hosting

Every link and asset path is relative, so the folder works from any subpath, for example GitHub Pages at `/ant-take-home/`. `.nojekyll` keeps GitHub Pages from processing the files. The page sets `noindex`.

## What this copy leaves out

- No Anthropic font files. Text uses the system font stacks already listed after Anthropic's fonts in the docs CSS.
- No icon font. Icons are inline Lucide SVGs.
- No site scripts, analytics, tracing, or consent metadata from the captured page. `assets/mock.js` is the only script; it restores code tabs, copy buttons, the table of contents, the phone menu, the leave dialog, and the header animation.
- `assets/docs.css` keeps only the rules from the captured docs stylesheets that this page uses.

See [THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md) for attribution and licenses.
