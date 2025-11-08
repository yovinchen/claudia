# Changelog

All notable changes to this project will be documented in this file.

## [1.3.0] - 2025-11-07

### Added
- Prompt file library (`src/components/PromptFilesManager.tsx`, `src/stores/promptFilesStore.ts`, `src/lib/api.ts`, `src-tauri/src/commands/prompt_files.rs`) with full CRUD, tagging/search, side-by-side preview/editor, CLAUDE.md import/export, and one-click apply/deactivate workflows.
- Cross-adapter API node manager (`src/components/NodeManager`, `src/lib/api.ts`, `src-tauri/src/utils/node_tester.rs`) that seeds default nodes, lets users persist custom endpoints, toggles availability, and runs single/bulk latency tests before wiring a relay station.
- Smart quick-start sessions (`src/App.tsx`, `src/components/WelcomePage.tsx`, `src/components/TabContent.tsx`, `src-tauri/src/commands/smart_sessions.rs`) so a single click spawns a ready-to-use Claude tab with toast/analytics feedback even when no project is selected yet.

### Improved
- Relay station workflow overhaul (`src/components/RelayStationManager.tsx`, `src/components/SortableStationItem.tsx`): drag-and-drop ordering, advanced toolbelt (DNS flush, JSON diff, hide/show details), raw source config backup editing, granular import/export progress, and tighter NodeSelector integration.
- Backend infrastructure hardening (`src-tauri/src/http_client.rs`, `src-tauri/src/utils/node_tester.rs`, `src-tauri/src/commands/*`, `src-tauri/src/utils/error.rs`): unified HTTP client presets, resilient node testing pipeline, richer error surfaces, and refactored usage/index storage to reduce duplication.
- Tab and onboarding UX (`src/App.tsx`, `src/components/WelcomePage.tsx`, `src/components/TabContent.tsx`, `src/components/Topbar.tsx`): deterministic tab creation, global events for smart sessions, better toasts, and hidden-detail toggles that keep the interface clean by default.

### Fixed
- Addressed multiple Tauri packaging and startup regressions (notably in `src-tauri/src/main.rs`, `src-tauri/src/commands/claude.rs`, `src-tauri/src/commands/filesystem.rs`) so macOS/Windows/Linux bundles install cleanly.
- Resolved quick-start/new-session routing bugs and project-card navigation glitches by synchronizing welcome-page actions with the tab manager (`src/components/WelcomePage.tsx`, `src/components/TabContent.tsx`).
- Filled missing translations and eliminated noisy runtime warnings across locales/components (`src/locales/en/common.json`, `src/locales/zh/common.json`, `src/components/ClaudeCodeSession.tsx`, `src/components/WelcomePage.tsx`).
- Patched long-text overflow & formatting regressions in prompts, station cards, and queues via new clamps/breakpoints (`src/components/PromptFilesManager.tsx`, `src/components/ClaudeCodeSession.tsx`, `src/components/SortableStationItem.tsx`, `src/components/SessionList.tsx`).

