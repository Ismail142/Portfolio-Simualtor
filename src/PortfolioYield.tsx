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

export default function PortfolioYield() {
  const [portfolioUSD, setPortfolioUSD] = useState<number | "">(50000);
  const [portfolioGHS, setPortfolioGHS] = useState<number | "">("");
  const [rate, setRate] = useState<number | "">(15);
  const lastEdited = useRef<LastEdited>("usd");

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const p = JSON.parse(saved);
        if (p.portfolioUSD !== undefined) setPortfolioUSD(p.portfolioUSD);
        if (p.portfolioGHS !== undefined) setPortfolioGHS(p.portfolioGHS);
        if (p.rate !== undefined) setRate(p.rate);
        if (p.lastEdited) lastEdited.current = p.lastEdited;
      }
    } catch { /* ignore */ }
  }, []);

  const saveToStorage = (usd: number | "", ghs: number | "", r: number | "", le: LastEdited) => {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ portfolioUSD: usd, portfolioGHS: ghs, rate: r, lastEdited: le }));
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

  const usdValue = typeof portfolioUSD === "number" && portfolioUSD >= 0 ? portfolioUSD : null;
  const ghsValue = typeof portfolioGHS === "number" && portfolioGHS >= 0 ? portfolioGHS : null;
  const hasValue = usdValue !== null && usdValue > 0;

  const rows = YIELD_RATES.map((pct) => {
    const annualUSD = usdValue !== null ? usdValue * (pct / 100) : null;
    const monthlyUSD = annualUSD !== null ? annualUSD / 12 : null;
    const rNum = typeof rate === "number" && rate > 0 ? rate : null;
    const monthlyGHS = monthlyUSD !== null && rNum ? monthlyUSD * rNum : null;
    return { pct, annualUSD, monthlyUSD, monthlyGHS };
  });

  return (
    <>
      <style>{`
        .yield-grid { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 12px; margin-bottom: 20px; }
        @media (max-width: 640px) { .yield-grid { grid-template-columns: 1fr; } }
        .yield-input-card { background: #0e0e18; border: 1px solid #1a1a28; border-radius: 10px; padding: 16px 18px; }
        .yield-input-label { font-family: 'DM Mono', monospace; font-size: 11px; letter-spacing: 1.5px; color: #888; margin-bottom: 8px; }
        .yield-input-field { width: 100%; background: transparent; border: none; outline: none; font-family: 'DM Mono', monospace; font-size: 22px; color: #00ff87; letter-spacing: 1px; padding: 0; box-sizing: border-box; }
        .yield-input-field::placeholder { color: #333; }
        .yield-input-hint { font-family: 'DM Mono', monospace; font-size: 10px; color: #555; margin-top: 4px; letter-spacing: 1px; }
        .yield-table-wrap { background: #0e0e18; border: 1px solid #1a1a28; border-radius: 10px; overflow: hidden; }
        .yield-table { width: 100%; border-collapse: collapse; }
        .yield-table th { font-family: 'DM Mono', monospace; font-size: 10px; letter-spacing: 1.5px; color: #555; text-align: right; padding: 12px 20px; border-bottom: 1px solid #1a1a28; background: #07071088; }
        .yield-table th:first-child { text-align: left; }
        .yield-table td { font-family: 'DM Mono', monospace; font-size: 13px; color: #aaa; text-align: right; padding: 14px 20px; border-bottom: 1px solid #0e0e1888; }
        .yield-table td:first-child { text-align: left; font-size: 15px; font-weight: 600; }
        .yield-table tr:last-child td { border-bottom: none; }
        .yield-table tr:hover td { background: #ffffff04; }
        .yield-val { color: #fff; }
        .yield-val-muted { color: #666; font-size: 11px; }
        .yield-summary { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-top: 16px; }
        @media (max-width: 480px) { .yield-summary { grid-template-columns: 1fr; } }
        .yield-summary-card { background: #0e0e18; border: 1px solid #1a1a28; border-radius: 10px; padding: 18px 20px; }
        .yield-summary-label { font-family: 'DM Mono', monospace; font-size: 10px; letter-spacing: 2px; color: #555; margin-bottom: 8px; }
        .yield-summary-value { font-family: 'DM Mono', monospace; font-size: 20px; color: #fff; letter-spacing: 1px; word-break: break-all; }
        .yield-summary-sub { font-family: 'DM Mono', monospace; font-size: 11px; color: #444; margin-top: 4px; letter-spacing: 1px; }
        .yield-empty { font-family: 'DM Mono', monospace; font-size: 12px; color: #444; letter-spacing: 1px; text-align: center; padding: 32px; }
        @media (max-width: 600px) {
          .yield-table th, .yield-table td { padding: 12px 12px; font-size: 11px; }
          .yield-table td:first-child { font-size: 13px; }
        }
      `}</style>

      <div className="yield-grid">
        <div className="yield-input-card">
          <div className="yield-input-label">PORTFOLIO VALUE (USD)</div>
          <input
            className="yield-input-field"
            type="number"
            min="0"
            placeholder="50000"
            value={typeof portfolioUSD === "number" ? parseFloat(portfolioUSD.toFixed(2)) : ""}
            onChange={(e) => handleUSDChange(e.target.value)}
          />
          <div className="yield-input-hint">US DOLLARS · $</div>
        </div>

        <div className="yield-input-card">
          <div className="yield-input-label">PORTFOLIO VALUE (GHS)</div>
          <input
            className="yield-input-field"
            type="number"
            min="0"
            placeholder="750000"
            value={typeof portfolioGHS === "number" ? parseFloat(portfolioGHS.toFixed(2)) : ""}
            onChange={(e) => handleGHSChange(e.target.value)}
          />
          <div className="yield-input-hint">GHANAIAN CEDI · ₵</div>
        </div>

        <div className="yield-input-card">
          <div className="yield-input-label">USD → GHS RATE</div>
          <input
            className="yield-input-field"
            type="number"
            min="0"
            step="0.01"
            placeholder="15"
            value={typeof rate === "number" ? rate : ""}
            onChange={(e) => handleRateChange(e.target.value)}
          />
          <div className="yield-input-hint">1 USD = ? GHS</div>
        </div>
      </div>

      <div className="yield-table-wrap">
        {!hasValue ? (
          <div className="yield-empty">Enter a portfolio value above to see yield projections</div>
        ) : (
          <table className="yield-table">
            <thead>
              <tr>
                <th>YIELD RATE</th>
                <th>MONTHLY (USD)</th>
                <th>MONTHLY (GHS)</th>
                <th>ANNUAL (USD)</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ pct, annualUSD, monthlyUSD, monthlyGHS }) => (
                <tr key={pct}>
                  <td>
                    <span style={{ color: RATE_COLORS[pct], fontFamily: "'DM Mono', monospace" }}>
                      {pct}%
                    </span>
                  </td>
                  <td>
                    {monthlyUSD !== null ? (
                      <>
                        <span className="yield-val">{fmtUSD(monthlyUSD)}</span>
                        <div className="yield-val-muted">{fmtFull(monthlyUSD, "USD")}/mo</div>
                      </>
                    ) : <span className="yield-val-muted">—</span>}
                  </td>
                  <td>
                    {monthlyGHS !== null ? (
                      <>
                        <span className="yield-val">{fmtGHS(monthlyGHS)}</span>
                        <div className="yield-val-muted">{fmtFull(monthlyGHS, "GHS")}/mo</div>
                      </>
                    ) : <span className="yield-val-muted">—</span>}
                  </td>
                  <td>
                    {annualUSD !== null ? (
                      <>
                        <span className="yield-val">{fmtUSD(annualUSD)}</span>
                        <div className="yield-val-muted">{fmtFull(annualUSD, "USD")}/yr</div>
                      </>
                    ) : <span className="yield-val-muted">—</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {hasValue && (
        <div className="yield-summary">
          <div className="yield-summary-card">
            <div className="yield-summary-label">TOTAL PORTFOLIO — USD</div>
            <div className="yield-summary-value">{fmtFull(usdValue!, "USD")}</div>
            <div className="yield-summary-sub">US DOLLARS</div>
          </div>
          <div className="yield-summary-card">
            <div className="yield-summary-label">TOTAL PORTFOLIO — GHS</div>
            <div className="yield-summary-value">
              {ghsValue !== null && ghsValue > 0
                ? fmtFull(ghsValue, "GHS")
                : typeof rate === "number" && rate > 0
                ? fmtFull(usdValue! * rate, "GHS")
                : "—"}
            </div>
            <div className="yield-summary-sub">GHANAIAN CEDI</div>
          </div>
        </div>
      )}
    </>
  );
}
