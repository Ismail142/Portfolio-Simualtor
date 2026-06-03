import { useEffect, useRef, useState } from "react";

const YIELD_RATES = [4, 5, 6, 7, 8] as const;
const RATE_COLORS: Record<number, string> = {
  4: "#00ff87",
  5: "#00d4ff",
  6: "#ffbe0b",
  7: "#ff6b6b",
  8: "#ff006e",
};

const STORAGE_KEY = "portfolio-yield-inputs";

function fmtUSD(n: number) {
  return n >= 1_000_000
    ? `$${(n / 1_000_000).toFixed(2)}M`
    : n >= 1_000
    ? `$${(n / 1_000).toFixed(2)}K`
    : `$${n.toFixed(2)}`;
}

function fmtGHS(n: number) {
  return n >= 1_000_000
    ? `₵${(n / 1_000_000).toFixed(2)}M`
    : n >= 1_000
    ? `₵${(n / 1_000).toFixed(2)}K`
    : `₵${n.toFixed(2)}`;
}

function fmtFull(n: number, currency: "USD" | "GHS") {
  const sym = currency === "USD" ? "$" : "₵";
  return `${sym}${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

type LastEdited = "usd" | "ghs";

type Calculated = {
  usd: number;
  ghs: number | null;
  rate: number | null;
};

export default function PortfolioYield() {
  const [portfolioUSD, setPortfolioUSD] = useState<number | "">(50000);
  const [portfolioGHS, setPortfolioGHS] = useState<number | "">("");
  const [rate, setRate] = useState<number | "">(15);
  const lastEdited = useRef<LastEdited>("usd");

  const [calculated, setCalculated] = useState<Calculated | null>(null);

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const p = JSON.parse(saved);
        if (p.portfolioUSD !== undefined) setPortfolioUSD(p.portfolioUSD);
        if (p.portfolioGHS !== undefined) setPortfolioGHS(p.portfolioGHS);
        if (p.rate !== undefined) setRate(p.rate);
        if (p.lastEdited) lastEdited.current = p.lastEdited;
        if (p.calculated) setCalculated(p.calculated);
      }
    } catch { /* ignore */ }
  }, []);

  const saveToStorage = (usd: number | "", ghs: number | "", r: number | "", le: LastEdited, calc?: Calculated | null) => {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ portfolioUSD: usd, portfolioGHS: ghs, rate: r, lastEdited: le, calculated: calc ?? calculated }));
    } catch { /* ignore */ }
  };

  const handleUSDChange = (val: string) => {
    const n = val === "" ? "" : parseFloat(val);
    setPortfolioUSD(n);
    lastEdited.current = "usd";
    const r = typeof rate === "number" && rate > 0 ? rate : null;
    const ghsVal = typeof n === "number" && r ? n * r : "";
    setPortfolioGHS(ghsVal);
    saveToStorage(n, ghsVal, rate, "usd");
  };

  const handleGHSChange = (val: string) => {
    const n = val === "" ? "" : parseFloat(val);
    setPortfolioGHS(n);
    lastEdited.current = "ghs";
    const r = typeof rate === "number" && rate > 0 ? rate : null;
    const usdVal = typeof n === "number" && r ? n / r : "";
    setPortfolioUSD(usdVal);
    saveToStorage(usdVal, n, rate, "ghs");
  };

  const handleRateChange = (val: string) => {
    const r = val === "" ? "" : parseFloat(val);
    setRate(r);
    const rNum = typeof r === "number" && r > 0 ? r : null;
    if (lastEdited.current === "usd" && typeof portfolioUSD === "number" && rNum) {
      const ghs = portfolioUSD * rNum;
      setPortfolioGHS(ghs);
      saveToStorage(portfolioUSD, ghs, r, "usd");
    } else if (lastEdited.current === "ghs" && typeof portfolioGHS === "number" && rNum) {
      const usd = portfolioGHS / rNum;
      setPortfolioUSD(usd);
      saveToStorage(usd, portfolioGHS, r, "ghs");
    } else {
      saveToStorage(portfolioUSD, portfolioGHS, r, lastEdited.current);
    }
  };

  const draftUSD = typeof portfolioUSD === "number" && portfolioUSD > 0 ? portfolioUSD : null;
  const draftGHS = typeof portfolioGHS === "number" && portfolioGHS > 0 ? portfolioGHS : null;
  const draftRate = typeof rate === "number" && rate > 0 ? rate : null;

  const canCalculate = draftUSD !== null;

  const isDirty =
    calculated !== null &&
    (calculated.usd !== draftUSD ||
      calculated.rate !== draftRate);

  const handleCalculate = () => {
    if (!canCalculate) return;
    const next: Calculated = { usd: draftUSD!, ghs: draftGHS, rate: draftRate };
    setCalculated(next);
    saveToStorage(portfolioUSD, portfolioGHS, rate, lastEdited.current, next);
  };

  const rows = calculated
    ? YIELD_RATES.map((pct) => {
        const annualUSD = calculated.usd * (pct / 100);
        const monthlyUSD = annualUSD / 12;
        const monthlyGHS = calculated.rate ? monthlyUSD * calculated.rate : null;
        const annualGHS = calculated.rate ? annualUSD * calculated.rate : null;
        return { pct, annualUSD, monthlyUSD, monthlyGHS, annualGHS };
      })
    : [];

  const calcGHSDisplay =
    calculated?.ghs ??
    (calculated?.usd && calculated?.rate ? calculated.usd * calculated.rate : null);

  const draftGHSDisplay =
    draftGHS ?? (draftUSD && draftRate ? draftUSD * draftRate : null);

  return (
    <>
      <style>{`
        .yield-input-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 16px; }
        .yield-sub { font-size: 11px; color: #555; letter-spacing: 1px; margin-top: 2px; }
        .yield-table td { text-align: right; }
        .yield-table td:first-child { text-align: left; position: sticky; left: 0; background: #0a0a14; z-index: 1; }
        .yield-table th { text-align: right; }
        .yield-table th:first-child { text-align: left; position: sticky; left: 0; background: #0a0a14; z-index: 2; }
        .yield-table tr:hover td { background: #ffffff04; }
        .yield-table tr:hover td:first-child { background: #0e0e1a; }
        .yield-table tr:last-child td { border-bottom: none; }
        .yield-cell-main { color: #fff; font-size: 13px; }
        .yield-cell-sub { color: #555; font-size: 10px; letter-spacing: 0.5px; margin-top: 2px; }
        .yield-summary-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
        @media (max-width: 480px) { .yield-summary-grid { grid-template-columns: 1fr; } }
        .yield-empty-msg { font-size: 12px; color: #555; letter-spacing: 1px; text-align: center; padding: 40px 0; }
        .yield-table-scroll { overflow-x: auto; -webkit-overflow-scrolling: touch; }
        .yield-table { min-width: 480px; }
      `}</style>

      {/* Input cards */}
      <div className="yield-input-grid" style={{ marginBottom: 0 }}>
        <div className="stat-card slider-wrap">
          <div className="slider-label">
            <span>Portfolio Value (USD)</span>
            <span className="slider-val">
              {draftUSD !== null ? fmtUSD(draftUSD) : "—"}
            </span>
          </div>
          <input
            className="num-input"
            type="number"
            min={0}
            step={1000}
            placeholder="50000"
            value={typeof portfolioUSD === "number" ? parseFloat(portfolioUSD.toFixed(4)) : ""}
            onChange={(e) => handleUSDChange(e.target.value)}
          />
          <div className="yield-sub">US DOLLARS · editing updates GHS</div>
        </div>

        <div className="stat-card slider-wrap">
          <div className="slider-label">
            <span>Portfolio Value (GHS)</span>
            <span className="slider-val">
              {draftGHSDisplay !== null ? fmtGHS(draftGHSDisplay) : "—"}
            </span>
          </div>
          <input
            className="num-input"
            type="number"
            min={0}
            step={100}
            placeholder="750000"
            value={typeof portfolioGHS === "number" ? parseFloat(portfolioGHS.toFixed(4)) : ""}
            onChange={(e) => handleGHSChange(e.target.value)}
          />
          <div className="yield-sub">GHANAIAN CEDI · editing updates USD</div>
        </div>

        <div className="stat-card slider-wrap">
          <div className="slider-label">
            <span>USD → GHS Rate</span>
            <span className="slider-val">
              {draftRate !== null ? `×${rate}` : "—"}
            </span>
          </div>
          <input
            className="num-input"
            type="number"
            min={0}
            step={0.1}
            placeholder="15"
            value={typeof rate === "number" ? rate : ""}
            onChange={(e) => handleRateChange(e.target.value)}
          />
          <div className="yield-sub">1 USD = ? GHS</div>
        </div>
      </div>

      {/* Calculate button row */}
      <div className="calc-bar">
        {isDirty && (
          <span className="calc-hint">Inputs changed — recalculate to update</span>
        )}
        <button
          type="button"
          className="calc-btn"
          disabled={!canCalculate}
          onClick={handleCalculate}
          style={{ marginLeft: "auto" }}
        >
          CALCULATE
        </button>
      </div>

      {/* Results — only shown after first calculate */}
      {calculated && (
        <>
          <div className="section">
            <p className="section-title">YIELD PROJECTIONS</p>
            <div className="yield-table-scroll">
            <table className="yield-table">
              <thead>
                <tr>
                  <th>RATE</th>
                  <th>MONTHLY (USD)</th>
                  <th>MONTHLY (GHS)</th>
                  <th>ANNUAL (USD)</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(({ pct, annualUSD, monthlyUSD, monthlyGHS }) => (
                  <tr key={pct}>
                    <td>
                      <span style={{ color: RATE_COLORS[pct], fontWeight: 600, fontSize: 15 }}>
                        {pct}%
                      </span>
                    </td>
                    <td>
                      <div className="yield-cell-main">{fmtUSD(monthlyUSD)}</div>
                      <div className="yield-cell-sub">{fmtFull(monthlyUSD, "USD")}/mo</div>
                    </td>
                    <td>
                      {monthlyGHS !== null ? (
                        <>
                          <div className="yield-cell-main">{fmtGHS(monthlyGHS)}</div>
                          <div className="yield-cell-sub">{fmtFull(monthlyGHS, "GHS")}/mo</div>
                        </>
                      ) : <span style={{ color: "#444" }}>—</span>}
                    </td>
                    <td>
                      <div className="yield-cell-main">{fmtUSD(annualUSD)}</div>
                      <div className="yield-cell-sub">{fmtFull(annualUSD, "USD")}/yr</div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
          </div>

          <div className="yield-summary-grid" style={{ marginTop: 16 }}>
            <div className="stat-card">
              <div style={{ fontSize: 11, color: "#555", letterSpacing: 2, fontFamily: "'DM Mono', monospace", marginBottom: 10 }}>
                TOTAL PORTFOLIO — USD
              </div>
              <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 28, color: "#00ff87", letterSpacing: 2 }}>
                {fmtFull(calculated.usd, "USD")}
              </div>
              <div style={{ fontSize: 11, color: "#444", letterSpacing: 1, marginTop: 4 }}>
                US DOLLARS
              </div>
            </div>

            <div className="stat-card">
              <div style={{ fontSize: 11, color: "#555", letterSpacing: 2, fontFamily: "'DM Mono', monospace", marginBottom: 10 }}>
                TOTAL PORTFOLIO — GHS
              </div>
              <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 28, color: "#00d4ff", letterSpacing: 2 }}>
                {calcGHSDisplay !== null ? fmtFull(calcGHSDisplay, "GHS") : "—"}
              </div>
              <div style={{ fontSize: 11, color: "#444", letterSpacing: 1, marginTop: 4 }}>
                GHANAIAN CEDI
              </div>
            </div>
          </div>
        </>
      )}

      {!calculated && (
        <div className="section">
          <div className="yield-empty-msg">Enter your portfolio value and press CALCULATE to see projections</div>
        </div>
      )}
    </>
  );
}
