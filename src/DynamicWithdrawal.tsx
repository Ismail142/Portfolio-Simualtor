import { useEffect, useMemo, useRef, useState } from "react";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { RETURNS } from "./data/historicalReturns";

const DW_STORAGE_KEY = "dynamic-withdrawal-inputs";

const HISTORICAL_RETURNS = RETURNS;

const DATA_YEARS = Object.keys(HISTORICAL_RETURNS)
  .map(Number)
  .sort((a, b) => a - b);
const MIN_YEAR = DATA_YEARS[0];
const MAX_YEAR = DATA_YEARS[DATA_YEARS.length - 1];

const RATES = [4, 5, 6, 7, 8] as const;
const RATE_COLORS: Record<number, string> = {
  4: "#00ff87",
  5: "#00d4ff",
  6: "#ffbe0b",
  7: "#ff6b6b",
  8: "#8338ec",
};

function getHistoricalReturn(calendarYear: number): number {
  if (HISTORICAL_RETURNS[calendarYear] !== undefined) return HISTORICAL_RETURNS[calendarYear];
  return 0;
}

const fmt = (n: number) =>
  n >= 1_000_000
    ? `$${(n / 1_000_000).toFixed(2)}M`
    : n >= 1000
      ? `$${(n / 1000).toFixed(0)}K`
      : `$${Math.round(n)}`;

const fmtGHS = (n: number, er: number | null): string | null => {
  if (!er) return null;
  const v = n * er;
  return v >= 1_000_000
    ? `₵${(v / 1_000_000).toFixed(2)}M`
    : v >= 1000
      ? `₵${(v / 1000).toFixed(0)}K`
      : `₵${Math.round(v)}`;
};

type SimYear = {
  year: number;
  calendarYear: number;
  portfolioBefore: number;
  withdrawal: number;
  portfolioAfter: number;
  annualReturn: number;
};

function simulate(
  initialPortfolio: number,
  withdrawalRate: number,
  startYear: number,
  endYear: number,
): SimYear[] {
  const retirementYears = endYear - startYear + 1;
  const result: SimYear[] = [];
  let portfolio = initialPortfolio;

  result.push({
    year: 0,
    calendarYear: startYear,
    portfolioBefore: portfolio,
    withdrawal: 0,
    portfolioAfter: portfolio,
    annualReturn: 0,
  });

  for (let y = 1; y <= retirementYears; y++) {
    const calendarYear = startYear + y - 1;
    const annualReturn = getHistoricalReturn(calendarYear);
    const portfolioBefore = portfolio;
    const withdrawal = portfolioBefore * (withdrawalRate / 100);
    const afterWithdrawal = portfolioBefore - withdrawal;
    portfolio = afterWithdrawal * (1 + annualReturn / 100);
    result.push({
      year: y,
      calendarYear,
      portfolioBefore: Math.round(portfolioBefore),
      withdrawal: Math.round(withdrawal),
      portfolioAfter: Math.round(portfolio),
      annualReturn,
    });
  }
  return result;
}

const MultiTooltip = ({
  active,
  payload,
  label,
  exchangeRate,
}: {
  active?: boolean;
  payload?: { name?: string; value?: number; color?: string }[];
  label?: number | string;
  exchangeRate: number | null;
}) => {
  if (!active || !payload?.length) return null;
  return (
    <div
      style={{
        background: "#0a0a12",
        border: "1px solid #1a1a28",
        borderRadius: 8,
        padding: "10px 14px",
        fontFamily: "'DM Mono', monospace",
        fontSize: 12,
      }}
    >
      <div style={{ color: "#888", marginBottom: 6, fontSize: 11, letterSpacing: 1 }}>{label}</div>
      {payload.map((p, i) => {
        const v = Number(p.value ?? 0);
        const ghs = fmtGHS(v, exchangeRate);
        return (
          <div key={i} style={{ color: p.color, lineHeight: 1.9 }}>
            {p.name}: {fmt(v)}
            {ghs ? <span style={{ color: "#666", fontSize: 10 }}> · {ghs}</span> : null}
          </div>
        );
      })}
    </div>
  );
};

export default function DynamicWithdrawal() {
  const [draftPortfolio, setDraftPortfolio] = useState<number | "">(500000);
  const [draftPortfolioGHS, setDraftPortfolioGHS] = useState<number | "">("");
  const [draftExchangeRate, setDraftExchangeRate] = useState<number | "">(15);
  const [draftStartYear, setDraftStartYear] = useState<number>(2000);
  const [draftDuration, setDraftDuration] = useState<number | "">(30);
  const lastEdited = useRef<"usd" | "ghs">("usd");

  const [portfolio, setPortfolio] = useState(500000);
  const [exchangeRate, setExchangeRate] = useState<number | null>(null);
  const [startYear, setStartYear] = useState(2000);
  const [duration, setDuration] = useState<number | null>(30);
  const [calculated, setCalculated] = useState(false);

  const endYear = duration === null ? MAX_YEAR : Math.min(startYear + duration - 1, MAX_YEAR);
  const years = endYear - startYear + 1;
  const draftEndYear =
    draftDuration === "" ? MAX_YEAR : Math.min(draftStartYear + draftDuration - 1, MAX_YEAR);
  const isCapped = draftDuration !== "" && draftStartYear + Number(draftDuration) - 1 > MAX_YEAR;

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(DW_STORAGE_KEY);
      if (!raw) return;
      const s = JSON.parse(raw) as {
        portfolio?: number;
        exchangeRate?: number;
        startYear?: number;
        duration?: number;
        portfolioGHS?: number;
      };
      const p = Math.max(1, Number(s.portfolio) || 500000);
      const er = s.exchangeRate && s.exchangeRate > 0 ? s.exchangeRate : null;
      const sy = Math.max(MIN_YEAR, Math.min(MAX_YEAR, Math.floor(Number(s.startYear) || 2000)));
      const dur = s.duration != null ? Math.max(1, Math.floor(Number(s.duration))) : null;
      const ghs = s.portfolioGHS && s.portfolioGHS > 0 ? s.portfolioGHS : er ? p * er : "";
      setDraftPortfolio(p);
      setDraftStartYear(sy);
      setDraftDuration(dur ?? "");
      if (er) setDraftExchangeRate(er);
      if (ghs) setDraftPortfolioGHS(ghs);
      setPortfolio(p);
      setExchangeRate(er);
      setStartYear(sy);
      setDuration(dur);
      setCalculated(true);
    } catch { /* ignore */ }
  }, []);

  const handleUSDChange = (val: string) => {
    const n = val === "" ? "" : +val;
    setDraftPortfolio(n);
    lastEdited.current = "usd";
    const er = typeof draftExchangeRate === "number" && draftExchangeRate > 0 ? draftExchangeRate : null;
    setDraftPortfolioGHS(typeof n === "number" && er ? n * er : "");
  };

  const handleGHSChange = (val: string) => {
    const n = val === "" ? "" : +val;
    setDraftPortfolioGHS(n);
    lastEdited.current = "ghs";
    const er = typeof draftExchangeRate === "number" && draftExchangeRate > 0 ? draftExchangeRate : null;
    setDraftPortfolio(typeof n === "number" && er ? n / er : "");
  };

  const handleExchangeRateChange = (val: string) => {
    const er = val === "" ? "" : +val;
    setDraftExchangeRate(er);
    const erNum = typeof er === "number" && er > 0 ? er : null;
    if (lastEdited.current === "usd" && typeof draftPortfolio === "number" && erNum) {
      setDraftPortfolioGHS(draftPortfolio * erNum);
    } else if (lastEdited.current === "ghs" && typeof draftPortfolioGHS === "number" && erNum) {
      setDraftPortfolio(draftPortfolioGHS / erNum);
    }
  };

  const draftDurationVal = draftDuration === "" ? null : Number(draftDuration);
  const isDirty =
    Number(draftPortfolio) !== portfolio ||
    (Number(draftExchangeRate) || null) !== exchangeRate ||
    draftStartYear !== startYear ||
    draftDurationVal !== duration;

  const handleCalculate = () => {
    const p = Math.max(1, Math.floor(Number(draftPortfolio) || 1));
    const er = typeof draftExchangeRate === "number" && draftExchangeRate > 0 ? draftExchangeRate : null;
    const sy = draftStartYear;
    const dur = draftDuration === "" ? null : Math.max(1, Math.floor(Number(draftDuration)));
    const ghsVal =
      typeof draftPortfolioGHS === "number" && draftPortfolioGHS > 0
        ? draftPortfolioGHS
        : er ? p * er : null;
    setDraftPortfolio(p);
    setDraftDuration(dur ?? "");
    if (er) setDraftExchangeRate(er);
    if (ghsVal) setDraftPortfolioGHS(ghsVal);
    setPortfolio(p);
    setExchangeRate(er);
    setStartYear(sy);
    setDuration(dur);
    setCalculated(true);
    try {
      window.localStorage.setItem(DW_STORAGE_KEY, JSON.stringify({
        portfolio: p, exchangeRate: er, startYear: sy, duration: dur ?? null, portfolioGHS: ghsVal,
      }));
    } catch { /* ignore */ }
  };

  const allSims = useMemo(
    () => RATES.map((r) => ({ rate: r, data: simulate(portfolio, r, startYear, endYear) })),
    [portfolio, startYear, endYear],
  );

  const chartData = useMemo(() => {
    const base = allSims[0].data;
    return base.map((row, i) => {
      const point: Record<string, number> = { calendarYear: row.calendarYear };
      allSims.forEach(({ rate, data }) => {
        point[`rate${rate}`] = data[i]?.portfolioAfter ?? 0;
      });
      return point;
    });
  }, [allSims]);

  const negYears = useMemo(
    () => allSims[0].data.filter((d) => d.annualReturn < 0).map((d) => d.calendarYear),
    [allSims],
  );

  return (
    <div style={{ maxWidth: 1200, margin: "0 auto" }}>
      {/* Inputs */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))",
          gap: 16,
        }}
      >
        <div className="stat-card slider-wrap">
          <div className="slider-label">
            <span>Portfolio Value (USD)</span>
            <span className="slider-val">{fmt(Number(draftPortfolio) || 0)}</span>
          </div>
          <input
            className="num-input"
            type="number"
            min={1}
            step={10000}
            value={draftPortfolio}
            onChange={(e) => handleUSDChange(e.target.value)}
          />
        </div>

        <div className="stat-card slider-wrap">
          <div className="slider-label">
            <span>Portfolio Value (GHS)</span>
            <span className="slider-val">
              {typeof draftPortfolioGHS === "number" && draftPortfolioGHS > 0
                ? (fmtGHS(draftPortfolioGHS, 1) ?? "—")
                : typeof draftPortfolio === "number" && typeof draftExchangeRate === "number" && draftExchangeRate > 0
                  ? (fmtGHS(draftPortfolio * draftExchangeRate, 1) ?? "—")
                  : "—"}
            </span>
          </div>
          <input
            className="num-input"
            type="number"
            min={1}
            step={10000}
            placeholder="e.g. 7500000"
            value={
              typeof draftPortfolioGHS === "number" && draftPortfolioGHS > 0
                ? parseFloat(draftPortfolioGHS.toFixed(2))
                : ""
            }
            onChange={(e) => handleGHSChange(e.target.value)}
          />
        </div>

        <div className="stat-card slider-wrap">
          <div className="slider-label">
            <span>USD → GHS Rate</span>
            <span className="slider-val">
              {typeof draftExchangeRate === "number" ? `×${draftExchangeRate}` : "—"}
            </span>
          </div>
          <input
            className="num-input"
            type="number"
            min={0}
            step={0.1}
            placeholder="15"
            value={typeof draftExchangeRate === "number" ? draftExchangeRate : ""}
            onChange={(e) => handleExchangeRateChange(e.target.value)}
          />
        </div>

        <div className="stat-card slider-wrap">
          <div className="slider-label">
            <span>Start Year</span>
            <span className="slider-val">{draftStartYear}</span>
          </div>
          <select
            style={{
              width: "100%",
              background: "#07070d",
              border: "1px solid #1a1a28",
              color: "#00ff87",
              fontFamily: "'DM Mono', monospace",
              fontSize: 15,
              padding: "8px 10px",
              borderRadius: 6,
              outline: "none",
              cursor: "pointer",
            }}
            value={draftStartYear}
            onChange={(e) => setDraftStartYear(Number(e.target.value))}
          >
            {DATA_YEARS.map((y) => (
              <option key={y} value={y} style={{ background: "#07070d" }}>
                {y} ({HISTORICAL_RETURNS[y] >= 0 ? "+" : ""}{HISTORICAL_RETURNS[y].toFixed(1)}%)
              </option>
            ))}
          </select>
        </div>

        <div className="stat-card slider-wrap">
          <div className="slider-label">
            <span>Duration (years)</span>
            <span className="slider-val">
              {draftDuration === "" ? `→ ${MAX_YEAR}` : draftDuration}
              {isCapped && (
                <span style={{ color: "#ffbe0b", fontSize: 11, marginLeft: 6 }}>
                  → capped {MAX_YEAR}
                </span>
              )}
            </span>
          </div>
          <input
            className="num-input"
            type="number"
            min={1}
            max={100}
            step={1}
            placeholder={`empty = full data (${MAX_YEAR})`}
            value={draftDuration}
            onChange={(e) => {
              const v = e.target.value;
              setDraftDuration(v === "" ? "" : Math.max(1, Math.floor(Number(v))));
            }}
          />
          <div style={{ fontSize: 11, color: "#555", letterSpacing: 1, marginTop: 4 }}>
            {draftDuration === ""
              ? `NO LIMIT · RUNS TO ${MAX_YEAR}`
              : isCapped
                ? `END YEAR CAPPED AT ${MAX_YEAR} · EFFECTIVE ${draftEndYear - draftStartYear + 1} YRS`
                : `END YEAR: ${draftEndYear}`}
          </div>
        </div>
      </div>

      <div className="calc-bar">
        <span className="calc-hint">{isDirty ? "Unapplied changes — press Calculate" : ""}</span>
        <button
          className="calc-btn"
          type="button"
          onClick={handleCalculate}
          disabled={!isDirty && calculated}
        >
          CALCULATE
        </button>
      </div>

      <div
        style={{
          background: "#0a0a14",
          border: "1px solid #15151f",
          borderRadius: 10,
          padding: "12px 18px",
          marginTop: 12,
          fontSize: 12,
          color: "#555",
          lineHeight: 1.8,
        }}
      >
        <span style={{ color: "#888", letterSpacing: 1 }}>STRATEGY · </span>
        Each year the portfolio grows (or falls) by the historical S&amp;P 500 return, then you
        withdraw a fixed percentage of whatever it is worth at that point. All five rates{" "}
        <span style={{ color: "#00ff87" }}>4%</span>,{" "}
        <span style={{ color: "#00d4ff" }}>5%</span>,{" "}
        <span style={{ color: "#ffbe0b" }}>6%</span>,{" "}
        <span style={{ color: "#ff6b6b" }}>7%</span>,{" "}
        <span style={{ color: "#8338ec" }}>8%</span>{" "}
        are simulated simultaneously using real S&P 500 returns {MIN_YEAR}–{MAX_YEAR}.
      </div>

      {calculated && (() => {
        const winnerBalance = allSims.reduce<{ rate: number; bal: number }>((best, s) => {
          const bal = s.data[s.data.length - 1].portfolioAfter;
          return bal > best.bal ? { rate: s.rate, bal } : best;
        }, { rate: RATES[0], bal: allSims[0].data[allSims[0].data.length - 1].portfolioAfter }).rate;

        const winnerWithdrawal = allSims.reduce<{ rate: number; avg: number }>((best, s) => {
          const rows = s.data.slice(1);
          const avg = rows.length > 0 ? rows.reduce((sum, d) => sum + d.withdrawal, 0) / rows.length / 12 : 0;
          return avg > best.avg ? { rate: s.rate, avg } : best;
        }, { rate: RATES[0], avg: 0 }).rate;

        return (
        <>
          {/* Rate comparison cards */}
          <div className="section">
            <h2 className="section-title">
              RATE COMPARISON · START {startYear} → {endYear} · {years} YEARS
            </h2>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
                gap: 12,
              }}
            >
              {allSims.map(({ rate, data }) => {
                const last = data[data.length - 1];
                const finalBalance = last.portfolioAfter;
                const grew = finalBalance > portfolio;
                const retainedPct = (finalBalance / portfolio) * 100;
                const rows = data.slice(1);
                const totalWithdrawn = rows.reduce((s, d) => s + d.withdrawal, 0);
                const avgMonthly = rows.length > 0 ? totalWithdrawn / rows.length / 12 : 0;
                const color = RATE_COLORS[rate];
                const isBestBalance = rate === winnerBalance;
                const isBestWithdrawal = rate === winnerWithdrawal;
                const isAnyWinner = isBestBalance || isBestWithdrawal;
                const survivalColor =
                  finalBalance >= portfolio
                    ? "#00ff87"
                    : retainedPct >= 50
                      ? "#00d4ff"
                      : retainedPct >= 10
                        ? "#ffbe0b"
                        : "#ff6b6b";
                const survivalLabel =
                  finalBalance >= portfolio
                    ? "THRIVING"
                    : retainedPct >= 50
                      ? "SURVIVED"
                      : retainedPct >= 10
                        ? "AT RISK"
                        : "DEPLETED";

                return (
                  <div
                    key={rate}
                    style={{
                      background: isAnyWinner ? "#0d1a12" : "#0e0e18",
                      border: isAnyWinner ? `2px solid ${color}` : `2px solid ${color}44`,
                      borderRadius: 12,
                      padding: "18px 20px",
                      paddingTop: isBestBalance && isBestWithdrawal ? 30 : isAnyWinner ? 28 : 18,
                      position: "relative",
                    }}
                  >
                    {isBestBalance && (
                      <div
                        style={{
                          position: "absolute",
                          top: -1,
                          left: isBestWithdrawal ? 14 : "auto",
                          right: isBestWithdrawal ? "auto" : 14,
                          background: "#00ff87",
                          color: "#050510",
                          fontFamily: "'Bebas Neue', sans-serif",
                          fontSize: 10,
                          letterSpacing: 1.5,
                          padding: "3px 10px",
                          borderRadius: "0 0 6px 6px",
                        }}
                      >
                        👑 BEST BALANCE
                      </div>
                    )}
                    {isBestWithdrawal && (
                      <div
                        style={{
                          position: "absolute",
                          top: -1,
                          right: 14,
                          background: "#ffbe0b",
                          color: "#050510",
                          fontFamily: "'Bebas Neue', sans-serif",
                          fontSize: 10,
                          letterSpacing: 1.5,
                          padding: "3px 10px",
                          borderRadius: "0 0 6px 6px",
                        }}
                      >
                        💰 BEST INCOME
                      </div>
                    )}

                    <div
                      style={{
                        fontFamily: "'Bebas Neue', sans-serif",
                        fontSize: 28,
                        color,
                        lineHeight: 1,
                        marginBottom: 10,
                      }}
                    >
                      {rate}% WITHDRAWAL
                    </div>

                    <div style={{ marginBottom: 8 }}>
                      <div style={{ fontSize: 10, color: "#555", letterSpacing: 1.5 }}>FINAL BALANCE</div>
                      <div style={{ fontSize: 20, fontFamily: "'Bebas Neue', sans-serif", color: grew ? "#00ff87" : "#ff6b6b" }}>
                        {fmt(finalBalance)}
                      </div>
                      {exchangeRate && (
                        <div style={{ fontSize: 11, color: "#888" }}>{fmtGHS(finalBalance, exchangeRate)}</div>
                      )}
                    </div>

                    <div style={{ marginBottom: 8 }}>
                      <div style={{ fontSize: 10, color: "#555", letterSpacing: 1.5 }}>AVG MONTHLY WITHDRAWAL</div>
                      {exchangeRate ? (
                        <div style={{ fontSize: 17, fontFamily: "'Bebas Neue', sans-serif", color: "#aaa" }}>
                          {fmtGHS(avgMonthly, exchangeRate)}<span style={{ fontSize: 11, color: "#666" }}>/mo</span>
                        </div>
                      ) : (
                        <div style={{ fontSize: 17, fontFamily: "'Bebas Neue', sans-serif", color: "#aaa" }}>
                          {fmt(avgMonthly)}<span style={{ fontSize: 11, color: "#666" }}>/mo</span>
                        </div>
                      )}
                    </div>

                    <div style={{ marginBottom: 10 }}>
                      <div style={{ fontSize: 10, color: "#555", letterSpacing: 1.5 }}>TOTAL WITHDRAWN</div>
                      <div style={{ fontSize: 17, fontFamily: "'Bebas Neue', sans-serif", color: "#aaa" }}>
                        {fmt(totalWithdrawn)}
                      </div>
                      {exchangeRate && (
                        <div style={{ fontSize: 11, color: "#888" }}>{fmtGHS(totalWithdrawn, exchangeRate)}</div>
                      )}
                    </div>

                    <div
                      style={{
                        fontSize: 11,
                        fontFamily: "'Bebas Neue', sans-serif",
                        color: survivalColor,
                        letterSpacing: 1.5,
                        borderTop: "1px solid #1a1a28",
                        paddingTop: 8,
                      }}
                    >
                      {survivalLabel}
                      <div
                        style={{
                          marginTop: 6,
                          height: 3,
                          background: "#1a1a28",
                          borderRadius: 2,
                          overflow: "hidden",
                        }}
                      >
                        <div
                          style={{
                            height: "100%",
                            width: `${Math.min(100, Math.max(0, retainedPct))}%`,
                            background: survivalColor,
                            borderRadius: 2,
                            transition: "width 0.4s",
                          }}
                        />
                      </div>
                      <div style={{ fontSize: 10, color: "#666", marginTop: 4 }}>
                        {retainedPct.toFixed(1)}% of start retained
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Multi-line chart */}
          <div className="section">
            <h2 className="section-title">PORTFOLIO BALANCE BY WITHDRAWAL RATE</h2>
            <p style={{ color: "#666", fontSize: 12, marginTop: -8, marginBottom: 14 }}>
              Portfolio value over time for each withdrawal rate · Red shading = negative-return years
            </p>
            <div style={{ width: "100%", height: 380 }}>
              <ResponsiveContainer>
                <LineChart
                  data={chartData}
                  margin={{ top: 10, right: 20, bottom: 20, left: 0 }}
                >
                  <CartesianGrid stroke="#1a1a28" strokeDasharray="3 3" />
                  <XAxis
                    dataKey="calendarYear"
                    stroke="#555"
                    tick={{ fill: "#666", fontSize: 11 }}
                    label={{ value: "Year", position: "insideBottom", offset: -10, fill: "#555", fontSize: 11 }}
                  />
                  <YAxis
                    stroke="#555"
                    tick={{ fill: "#666", fontSize: 11 }}
                    tickFormatter={(v) => fmt(Number(v))}
                  />
                  <Tooltip content={<MultiTooltip exchangeRate={exchangeRate} />} />
                  <Legend
                    wrapperStyle={{ fontSize: 12, fontFamily: "'DM Mono', monospace", color: "#888", paddingTop: 8 }}
                    formatter={(value) => value}
                  />
                  {negYears.map((cy) => (
                    <ReferenceLine
                      key={`neg-${cy}`}
                      x={cy}
                      stroke="#ff6b6b"
                      strokeOpacity={0.1}
                      strokeWidth={20}
                    />
                  ))}
                  {RATES.map((r) => (
                    <Line
                      key={r}
                      type="monotone"
                      dataKey={`rate${r}`}
                      name={`${r}%`}
                      stroke={RATE_COLORS[r]}
                      strokeWidth={2}
                      dot={false}
                      activeDot={{ r: 4 }}
                    />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Year-by-year table */}
          <style>{`
            .dw-table { min-width: 700px; }
            .dw-table th, .dw-table td { background: #0a0a14; }
            .dw-table th:nth-child(1), .dw-table td:nth-child(1) {
              position: sticky; left: 0; z-index: 2; min-width: 72px; white-space: nowrap;
            }
            .dw-table th:nth-child(2), .dw-table td:nth-child(2) {
              position: sticky; left: 72px; z-index: 2; white-space: nowrap;
              box-shadow: 4px 0 10px rgba(0,0,0,0.7);
              clip-path: inset(0px -20px 0px 0px);
            }
            .dw-table tr:hover td { background: #0e0e1a; }
          `}</style>
          <div className="section">
            <h2 className="section-title">YEAR-BY-YEAR PORTFOLIO BALANCE</h2>
            <div style={{ overflowX: "auto", WebkitOverflowScrolling: "touch" }}>
              <table className="dw-table">
                <thead>
                  <tr>
                    <th>Year</th>
                    <th>Return</th>
                    {RATES.map((r) => (
                      <th key={r} style={{ color: RATE_COLORS[r] }}>{r}% Balance</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {allSims[0].data.map((row, i) => {
                    const retColor =
                      row.annualReturn < 0 ? "#ff6b6b" : row.annualReturn > 20 ? "#00ff87" : "#aaa";
                    return (
                      <tr key={row.year}>
                        <td style={{ color: "#888" }}>
                          {row.year === 0 ? "Start" : row.calendarYear}
                        </td>
                        <td style={{ color: retColor, fontWeight: 500 }}>
                          {row.year === 0
                            ? "—"
                            : `${row.annualReturn >= 0 ? "+" : ""}${row.annualReturn.toFixed(1)}%`}
                        </td>
                        {allSims.map(({ rate, data }) => {
                          const val = data[i]?.portfolioAfter ?? 0;
                          const color =
                            val > portfolio ? "#00ff87" : val > portfolio * 0.5 ? "#00d4ff" : val > portfolio * 0.25 ? "#ffbe0b" : "#ff6b6b";
                          return (
                            <td key={rate} style={{ color, fontWeight: 500 }}>
                              {fmt(val)}
                              {exchangeRate ? (
                                <span style={{ color: "#555", fontSize: 10, marginLeft: 5 }}>
                                  {fmtGHS(val, exchangeRate)}
                                </span>
                              ) : null}
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          <div
            className="section"
            style={{ background: "#0a0a14", border: "1px solid #1a1a28", borderRadius: 12, padding: "16px 20px" }}
          >
            <div style={{ display: "flex", gap: 24, flexWrap: "wrap", fontSize: 12 }}>
              <div>
                <span style={{ color: "#555", letterSpacing: 1 }}>DATA SOURCE</span>
                <span style={{ color: "#aaa", marginLeft: 10 }}>S&P 500 Total Return {MIN_YEAR}–{MAX_YEAR}</span>
              </div>
              <div>
                <span style={{ color: "#555", letterSpacing: 1 }}>WITHDRAWAL RULE</span>
                <span style={{ color: "#00ff87", marginLeft: 10 }}>4 / 5 / 6 / 7 / 8% of current portfolio value each year</span>
              </div>
              <div>
                <span style={{ color: "#555", letterSpacing: 1 }}>SEQUENCE TESTED</span>
                <span style={{ color: "#aaa", marginLeft: 10 }}>{startYear} → {endYear}</span>
              </div>
            </div>
          </div>
        </>
        );
      })()}

      {!calculated && (
        <div
          className="section"
          style={{ textAlign: "center", padding: "40px 22px", color: "#444" }}
        >
          <div style={{ fontSize: 36, marginBottom: 12 }}>📈</div>
          <div style={{ fontSize: 14, letterSpacing: 1 }}>
            Enter your details above and press CALCULATE to compare all five withdrawal rates
          </div>
        </div>
      )}
    </div>
  );
}
