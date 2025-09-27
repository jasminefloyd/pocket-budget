# Performance Validation

Pocket Budget instruments render performance for the budget overview and AI insights experiences so we can spot latency regressions early.

## Instrumentation
- `useRenderTimer` wraps key surfaces (`BudgetsScreen` and `AIInsightsScreen`) and records render duration using `performance.now()`.
- Each render logs a debug message (prefixed with `[perf]`) and surfaces `data-perf-*` attributes for automated capture.
- Thresholds guard against regressions:
  - Budget overview summary: 500 ms target (4G).
  - AI insights: 700 ms cached, 1500 ms when regenerating.
- When a threshold is exceeded a console warning is emitted so the regression is visible even without tooling.

## Manual Verification
1. Start the app (`npm run dev`).
2. Open Chrome DevTools → Performance → **Capture Settings** and throttle to “Fast 4G / 4x CPU slowdown”.
3. Load the Budgets screen and note the `[perf] budgets-overview` log; ensure it stays ≤500 ms.
4. Navigate to AI Insights, trigger a refresh, and review the `[perf] ai-insights-cards` log for both cached (~700 ms) and regenerated (~1.5 s) paths.
5. Watch for automatic warnings in the console. These are emitted if thresholds are breached.

## Regression Safeguards
- The ad slot reserves layout space with `min-height` so lazy ad loads do not shift content.
- The performance attributes can be asserted in automated end-to-end tests (e.g., Playwright) by reading `data-perf-duration`.
- When optimizing, prefer memoised selectors and batched Supabase requests to keep render durations inside the thresholds.
