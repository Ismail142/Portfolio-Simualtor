## Add fixed monthly withdrawal mode

Introduce a mode switch so the simulator can use either the existing percentage-based withdrawals or a manually specified fixed monthly amount.

### UX
- Add a **Withdrawal Mode** toggle near the input cards: `Percentage` | `Fixed amount`.
- When `Fixed amount` is selected:
  - Hide the "Toggle Withdrawal Rates" comparison section.
  - Show a new input card: **Monthly Withdrawal ($)** (numeric, draft + Calculate flow like the others).
  - Charts (Portfolio Value & Annual Expenses) render a single line based on the fixed amount.
  - Summary table collapses to a single row showing: Monthly Withdrawal, Final Portfolio, Status (Growing / Declining / Depleted year X).
- When `Percentage` is selected: current behavior unchanged.

### Logic
- Extend `simulatePortfolio` to accept a withdrawal spec: either `{ type: 'pct', rate }` or `{ type: 'fixed', monthly }`.
  - Fixed: `withdrawal = monthly * 12` (flat, no inflation), capped at current portfolio value.
  - Yearly step unchanged: `value = (value - withdrawal + annualContribution) * (1 + annualReturn/100)`.
- Persist `mode` and `monthlyWithdrawal` in the same `localStorage` key alongside existing inputs.
- Apply via the existing `CALCULATE` button (same dirty-check pattern).

### Files
- `src/App.tsx` — only file touched.

### Out of scope
- No inflation adjustment (per your choice).
- No mixing fixed + percentage lines on the same chart.
