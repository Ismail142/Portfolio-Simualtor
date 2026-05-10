import { useEffect, useMemo, useState } from "react";
import CompoundGrowth from "./CompoundGrowth";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

const RATES = [4, 5, 6, 7, 8, 10] as const;
const COLORS = ["#00ff87", "#00d4ff", "#ffbe0b", "#ff6b6b", "#ff006e", "#8338ec"];
const FIXED_COLOR = "#00ff87";

type YearPoint = { year: number; value: number; withdrawal: number };
type WithdrawalSpec = { type: "pct"; rate: number } | { type: "fixed"; monthly: number };
type Mode = "pct" | "fixed";

function simulatePortfolio(
  startValue: number,
  spec: WithdrawalSpec,
  annualReturn: number,
  numYears: number,
  monthlyContribution: number,
): YearPoint[] {
  const data: YearPoint[] = [];
  let value = startValue;
  const annualContribution = monthlyContribution * 12;
  for (let y = 0; y <= numYears; y++) {
    let withdrawal = 0;
    if (y > 0) {
      withdrawal =
        spec.type === "pct" ? value * (spec.rate / 100) : Math.min(spec.monthly * 12, value);
      value = (value - withdrawal + annualContribution) * (1 + annualReturn / 100);
    }
    data.push({
      year: y,
      value: Math.max(0, Math.round(value)),
      withdrawal: Math.round(withdrawal),
    });
    if (value <= 0) break;
  }
  return data;
}

const fmt = (n: number) =>
  n >= 1_000_000
    ? `$${(n / 1_000_000).toFixed(2)}M`
    : n >= 1000
      ? `$${(n / 1000).toFixed(0)}K`
      : `$${Math.round(n)}`;

type TooltipPayload = { name?: string; value?: number; color?: string };
const CustomTooltip = ({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: TooltipPayload[];
  label?: number | string;
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
      <div style={{ color: "#888", marginBottom: 6, fontSize: 11, letterSpacing: 1 }}>
        YEAR {label}
      </div>
      {payload.map((p, i) => (
        <div key={i} style={{ color: p.color, lineHeight: 1.7 }}>
          {p.name}: {fmt(Number(p.value ?? 0))}
        </div>
      ))}
    </div>
  );
};

type Page = "simulator" | "compound";

const STORAGE_KEY = "portfolio-simulator-inputs";

export default function App() {
  const [page, setPage] = useState<Page>("simulator");
  const [draftPortfolio, setDraftPortfolio] = useState<number | "">(50000);
  const [draftMarketReturn, setDraftMarketReturn] = useState<number | "">(10);
  const [draftNumYears, setDraftNumYears] = useState<number | "">(20);
  const [draftMonthlyContribution, setDraftMonthlyContribution] = useState<number | "">(0);
  const [draftMonthlyWithdrawal, setDraftMonthlyWithdrawal] = useState<number | "">(2000);
  const [draftMode, setDraftMode] = useState<Mode>("pct");

  const [portfolio, setPortfolio] = useState(50000);
  const [marketReturn, setMarketReturn] = useState(10);
  const [numYears, setNumYears] = useState(20);
  const [monthlyContribution, setMonthlyContribution] = useState(0);
  const [monthlyWithdrawal, setMonthlyWithdrawal] = useState(2000);
  const [mode, setMode] = useState<Mode>("pct");
  const [selectedRates, setSelectedRates] = useState<number[]>([4, 5, 6]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const saved = JSON.parse(raw) as {
        portfolio?: number;
        marketReturn?: number;
        numYears?: number;
        monthlyContribution?: number;
        monthlyWithdrawal?: number;
        mode?: Mode;
      };
      const p = Math.max(1, Math.floor(Number(saved.portfolio) || 1));
      const m = Math.max(1, Number(saved.marketReturn) || 1);
      const y = Math.max(1, Math.floor(Number(saved.numYears) || 1));
      const c = Math.max(0, Math.floor(Number(saved.monthlyContribution) || 0));
      const w = Math.max(0, Math.floor(Number(saved.monthlyWithdrawal) || 0));
      const md: Mode = saved.mode === "fixed" ? "fixed" : "pct";
      setDraftPortfolio(p);
      setDraftMarketReturn(m);
      setDraftNumYears(y);
      setDraftMonthlyContribution(c);
      setDraftMonthlyWithdrawal(w);
      setDraftMode(md);
      setPortfolio(p);
      setMarketReturn(m);
      setNumYears(y);
      setMonthlyContribution(c);
      setMonthlyWithdrawal(w);
      setMode(md);
    } catch {
      /* ignore corrupt storage */
    }
  }, []);

  const toggleRate = (r: number) =>
    setSelectedRates((prev) =>
      prev.includes(r) ? prev.filter((x) => x !== r) : [...prev, r].sort((a, b) => a - b),
    );

  const isDirty =
    Number(draftPortfolio) !== portfolio ||
    Number(draftMarketReturn) !== marketReturn ||
    Number(draftNumYears) !== numYears ||
    Number(draftMonthlyContribution) !== monthlyContribution ||
    Number(draftMonthlyWithdrawal) !== monthlyWithdrawal ||
    draftMode !== mode;

  const handleCalculate = () => {
    const p = Math.max(1, Math.floor(Number(draftPortfolio) || 1));
    const m = Math.max(1, Number(draftMarketReturn) || 1);
    const y = Math.max(1, Math.floor(Number(draftNumYears) || 1));
    const c = Math.max(0, Math.floor(Number(draftMonthlyContribution) || 0));
    const w = Math.max(0, Math.floor(Number(draftMonthlyWithdrawal) || 0));
    setDraftPortfolio(p);
    setDraftMarketReturn(m);
    setDraftNumYears(y);
    setDraftMonthlyContribution(c);
    setDraftMonthlyWithdrawal(w);
    setPortfolio(p);
    setMarketReturn(m);
    setNumYears(y);
    setMonthlyContribution(c);
    setMonthlyWithdrawal(w);
    setMode(draftMode);
    if (typeof window !== "undefined") {
      try {
        window.localStorage.setItem(
          STORAGE_KEY,
          JSON.stringify({
            portfolio: p,
            marketReturn: m,
            numYears: y,
            monthlyContribution: c,
            monthlyWithdrawal: w,
            mode: draftMode,
          }),
        );
      } catch {
        /* storage may be unavailable */
      }
    }
  };

  const fixedKey = "Fixed";

  const allData = useMemo(() => {
    const yearArr: Record<string, number>[] = Array.from({ length: numYears + 1 }, (_, i) => ({
      year: i,
    }));
    if (mode === "pct") {
      selectedRates.forEach((rate) => {
        const sim = simulatePortfolio(
          portfolio,
          { type: "pct", rate },
          marketReturn,
          numYears,
          monthlyContribution,
        );
        sim.forEach((d) => {
          yearArr[d.year][`${rate}%`] = d.value;
          yearArr[d.year][`w${rate}`] = d.withdrawal;
        });
      });
    } else {
      const sim = simulatePortfolio(
        portfolio,
        { type: "fixed", monthly: monthlyWithdrawal },
        marketReturn,
        numYears,
        monthlyContribution,
      );
      sim.forEach((d) => {
        yearArr[d.year][fixedKey] = d.value;
        yearArr[d.year][`w${fixedKey}`] = d.withdrawal;
      });
    }
    return yearArr;
  }, [portfolio, marketReturn, numYears, selectedRates, monthlyContribution, monthlyWithdrawal, mode]);

  const summaryRows = useMemo(() => {
    if (mode === "pct") {
      return RATES.map((rate) => {
        const sim = simulatePortfolio(
          portfolio,
          { type: "pct", rate },
          marketReturn,
          numYears,
          monthlyContribution,
        );
        const lastPoint = sim[sim.length - 1];
        const depletedAt = lastPoint.value === 0 ? sim.findIndex((d) => d.value === 0) : null;
        const yr1Withdrawal = sim[1]?.withdrawal || 0;
        const lastWithdrawal = lastPoint.value > 0 ? Math.round(lastPoint.value * (rate / 100)) : 0;
        return {
          label: `${rate}%`,
          yr1Withdrawal,
          lastWithdrawal,
          finalValue: lastPoint.value,
          depletedAt,
        };
      });
    }
    const sim = simulatePortfolio(
      portfolio,
      { type: "fixed", monthly: monthlyWithdrawal },
      marketReturn,
      numYears,
      monthlyContribution,
    );
    const lastPoint = sim[sim.length - 1];
    const depletedAt = lastPoint.value === 0 ? sim.findIndex((d) => d.value === 0) : null;
    const yr1Withdrawal = sim[1]?.withdrawal || 0;
    const lastWithdrawal = sim[sim.length - 1]?.withdrawal || 0;
    return [
      {
        label: `${fmt(monthlyWithdrawal)}/mo`,
        yr1Withdrawal,
        lastWithdrawal,
        finalValue: lastPoint.value,
        depletedAt,
      },
    ];
  }, [portfolio, marketReturn, numYears, monthlyContribution, monthlyWithdrawal, mode]);

  const colorFor = (rate: number) => COLORS[RATES.indexOf(rate as (typeof RATES)[number])];

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#070710",
        color: "#e6e6f0",
        fontFamily: "'DM Mono', monospace",
      }}
    >
      <style>{`
        .rate-btn { border: 1px solid #333; background: transparent; color: #666; padding: 6px 14px; border-radius: 6px; cursor: pointer; font-family: 'DM Mono', monospace; font-size: 13px; transition: all 0.15s; }
        .rate-btn.active { border-color: currentColor; background: #ffffff12; }
        .rate-btn:hover { border-color: #555; }
        .stat-card { background: #0e0e18; border: 1px solid #1a1a28; border-radius: 12px; padding: 18px 20px; }
        .slider-wrap { display: flex; flex-direction: column; gap: 8px; }
        .slider-label { display: flex; justify-content: space-between; align-items: baseline; font-size: 12px; color: #888; letter-spacing: 0.5px; }
        .slider-val { color: #00ff87; font-weight: 500; font-size: 15px; }
        .section { background: #0a0a14; border: 1px solid #15151f; border-radius: 14px; padding: 22px; margin-top: 22px; }
        .section-title { font-family: 'Bebas Neue', sans-serif; font-size: 14px; letter-spacing: 3px; color: #888; margin: 0 0 16px; }
        table { width: 100%; border-collapse: collapse; font-size: 13px; }
        th { text-align: left; font-weight: 400; color: #666; padding: 10px 12px; border-bottom: 1px solid #1a1a28; font-size: 11px; letter-spacing: 1px; }
        td { padding: 12px; border-bottom: 1px solid #14141c; }
        .num-input { width: 100%; background: #07070d; border: 1px solid #1a1a28; color: #00ff87; font-family: 'DM Mono', monospace; font-size: 15px; padding: 8px 10px; border-radius: 6px; outline: none; text-align: right; }
        .num-input:focus { border-color: #00ff87; box-shadow: 0 0 0 2px #00ff8722; }
        .num-input::-webkit-outer-spin-button, .num-input::-webkit-inner-spin-button { -webkit-appearance: none; margin: 0; }
        .num-input[type=number] { -moz-appearance: textfield; }
        .calc-bar { display: flex; justify-content: space-between; align-items: center; gap: 14px; margin-top: 16px; flex-wrap: wrap; }
        .calc-hint { font-size: 12px; color: #ffbe0b; letter-spacing: 0.5px; }
        .calc-btn { background: #00ff87; color: #050510; border: none; padding: 12px 28px; border-radius: 8px; font-family: 'Bebas Neue', sans-serif; font-size: 16px; letter-spacing: 3px; cursor: pointer; box-shadow: 0 0 20px #00ff8744; transition: all 0.15s; }
        .calc-btn:hover:not(:disabled) { background: #00ffa3; box-shadow: 0 0 28px #00ff8788; }
        .calc-btn:disabled { background: #1a1a28; color: #555; cursor: not-allowed; box-shadow: none; }
        .mode-switch { display: inline-flex; border: 1px solid #1a1a28; border-radius: 8px; overflow: hidden; background: #0e0e18; }
        .mode-btn { background: transparent; color: #666; border: none; padding: 10px 18px; font-family: 'DM Mono', monospace; font-size: 12px; letter-spacing: 1.5px; cursor: pointer; transition: all 0.15s; }
        .mode-btn.active { background: #00ff8722; color: #00ff87; }
        .topbar { position: sticky; top: 0; z-index: 50; background: #07071099; backdrop-filter: blur(12px); border-bottom: 1px solid #1a1a28; }
        .topbar-inner { max-width: 1200px; margin: 0 auto; padding: 0 24px; display: flex; align-items: center; justify-content: space-between; height: 52px; gap: 16px; }
        .topbar-brand { font-family: 'Bebas Neue', sans-serif; font-size: 18px; letter-spacing: 3px; color: #fff; white-space: nowrap; }
        .nav-pills { display: flex; gap: 2px; background: #0e0e18; border: 1px solid #1a1a28; border-radius: 8px; padding: 3px; }
        .nav-pill { background: transparent; border: none; color: #666; font-family: 'DM Mono', monospace; font-size: 11px; letter-spacing: 1.5px; padding: 6px 16px; border-radius: 6px; cursor: pointer; transition: all 0.15s; white-space: nowrap; }
        .nav-pill.active { background: #00ff8718; color: #00ff87; }
        .nav-pill:hover:not(.active) { color: #aaa; background: #ffffff08; }
      `}</style>

      <div className="topbar">
        <div className="topbar-inner">
          <span className="topbar-brand">FINANCE TOOLS</span>
          <nav className="nav-pills">
            <button
              type="button"
              className={`nav-pill ${page === "simulator" ? "active" : ""}`}
              onClick={() => setPage("simulator")}
            >
              PORTFOLIO SIMULATOR
            </button>
            <button
              type="button"
              className={`nav-pill ${page === "compound" ? "active" : ""}`}
              onClick={() => setPage("compound")}
            >
              COMPOUND GROWTH
            </button>
          </nav>
        </div>
      </div>

      <div style={{ padding: "32px 24px 64px" }}>
      <header style={{ maxWidth: 1200, margin: "0 auto 24px" }}>
        <h1
          style={{
            fontFamily: "'Bebas Neue', sans-serif",
            fontSize: "clamp(32px, 4vw, 50px)",
            letterSpacing: 4,
            margin: 0,
            color: "#fff",
          }}
        >
          {page === "simulator" ? "PORTFOLIO SIMULATOR" : "COMPOUND GROWTH"}
        </h1>
        <p style={{ color: "#777", margin: "4px 0 0", fontSize: 13 }}>
          {page === "simulator"
            ? "Choose % withdrawal or fixed monthly amount · monthly contributions included"
            : "Calculate how your investment grows with compound interest and regular contributions"}
        </p>
      </header>

      <div style={{ maxWidth: 1200, margin: "0 auto" }}>
        {page === "compound" && <CompoundGrowth />}
        {page === "simulator" && (<>
        <div style={{ marginBottom: 16, display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
          <span style={{ fontSize: 12, color: "#888", letterSpacing: 1.5 }}>WITHDRAWAL MODE</span>
          <div className="mode-switch">
            <button
              type="button"
              className={`mode-btn ${draftMode === "pct" ? "active" : ""}`}
              onClick={() => setDraftMode("pct")}
            >
              PERCENTAGE
            </button>
            <button
              type="button"
              className={`mode-btn ${draftMode === "fixed" ? "active" : ""}`}
              onClick={() => setDraftMode("fixed")}
            >
              FIXED AMOUNT
            </button>
          </div>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
            gap: 16,
          }}
        >
          <div className="stat-card slider-wrap">
            <div className="slider-label">
              <span>Starting Portfolio ($)</span>
              <span className="slider-val">{fmt(Number(draftPortfolio) || 0)}</span>
            </div>
            <input
              className="num-input"
              type="number"
              min={1}
              step={1000}
              value={draftPortfolio}
              onChange={(e) => setDraftPortfolio(e.target.value === "" ? "" : +e.target.value)}
            />
          </div>

          <div className="stat-card slider-wrap">
            <div className="slider-label">
              <span>Annual Market Return (%)</span>
              <span className="slider-val">{Number(draftMarketReturn) || 0}%</span>
            </div>
            <input
              className="num-input"
              type="number"
              min={1}
              step={0.1}
              value={draftMarketReturn}
              onChange={(e) => setDraftMarketReturn(e.target.value === "" ? "" : +e.target.value)}
            />
          </div>

          <div className="stat-card slider-wrap">
            <div className="slider-label">
              <span>Simulation Years</span>
              <span className="slider-val">{Number(draftNumYears) || 0} yrs</span>
            </div>
            <input
              className="num-input"
              type="number"
              min={1}
              step={1}
              value={draftNumYears}
              onChange={(e) => setDraftNumYears(e.target.value === "" ? "" : +e.target.value)}
            />
          </div>

          <div className="stat-card slider-wrap">
            <div className="slider-label">
              <span>Monthly Contribution ($)</span>
              <span className="slider-val">{fmt(Number(draftMonthlyContribution) || 0)}</span>
            </div>
            <input
              className="num-input"
              type="number"
              min={0}
              step={50}
              value={draftMonthlyContribution}
              onChange={(e) =>
                setDraftMonthlyContribution(e.target.value === "" ? "" : +e.target.value)
              }
            />
          </div>

          {draftMode === "fixed" && (
            <div className="stat-card slider-wrap">
              <div className="slider-label">
                <span>Monthly Withdrawal ($)</span>
                <span className="slider-val">{fmt(Number(draftMonthlyWithdrawal) || 0)}</span>
              </div>
              <input
                className="num-input"
                type="number"
                min={0}
                step={100}
                value={draftMonthlyWithdrawal}
                onChange={(e) =>
                  setDraftMonthlyWithdrawal(e.target.value === "" ? "" : +e.target.value)
                }
              />
            </div>
          )}
        </div>

        <div className="calc-bar">
          <span className="calc-hint">{isDirty ? "Unapplied changes — press Calculate" : ""}</span>
          <button className="calc-btn" onClick={handleCalculate} disabled={!isDirty} type="button">
            CALCULATE
          </button>
        </div>

        {mode === "pct" && (
          <div className="section">
            <h2 className="section-title">TOGGLE WITHDRAWAL RATES TO COMPARE</h2>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
              {RATES.map((r, i) => {
                const active = selectedRates.includes(r);
                return (
                  <button
                    key={r}
                    className={`rate-btn ${active ? "active" : ""}`}
                    style={{ color: active ? COLORS[i] : undefined }}
                    onClick={() => toggleRate(r)}
                  >
                    {r}%
                  </button>
                );
              })}
            </div>
          </div>
        )}

        <div className="section">
          <h2 className="section-title">PORTFOLIO VALUE OVER TIME</h2>
          <div style={{ width: "100%", height: 360 }}>
            <ResponsiveContainer>
              <LineChart data={allData} margin={{ top: 10, right: 20, bottom: 0, left: 0 }}>
                <CartesianGrid stroke="#1a1a28" strokeDasharray="3 3" />
                <XAxis
                  dataKey="year"
                  stroke="#555"
                  tick={{ fill: "#666", fontSize: 11 }}
                  label={{ value: "Year", position: "insideBottom", offset: -5, fill: "#555" }}
                />
                <YAxis
                  stroke="#555"
                  tick={{ fill: "#666", fontSize: 11 }}
                  tickFormatter={(v) => fmt(Number(v))}
                />
                <Tooltip content={<CustomTooltip />} />
                <Legend wrapperStyle={{ fontSize: 12, color: "#888" }} />
                {mode === "pct" ? (
                  selectedRates.map((r) => (
                    <Line
                      key={r}
                      type="monotone"
                      dataKey={`${r}%`}
                      stroke={colorFor(r)}
                      strokeWidth={2}
                      dot={false}
                      activeDot={{ r: 4 }}
                    />
                  ))
                ) : (
                  <Line
                    type="monotone"
                    dataKey={fixedKey}
                    name={`${fmt(monthlyWithdrawal)}/mo`}
                    stroke={FIXED_COLOR}
                    strokeWidth={2}
                    dot={false}
                    activeDot={{ r: 4 }}
                  />
                )}
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="section">
          <h2 className="section-title">ANNUAL EXPENSES (= WITHDRAWAL AMOUNT)</h2>
          <p style={{ color: "#666", fontSize: 12, marginTop: -8, marginBottom: 14 }}>
            {mode === "pct"
              ? "Your expenses each year equal exactly what you withdraw — they rise and fall with the portfolio"
              : "Fixed monthly withdrawal — flat each year (capped if portfolio runs low)"}
          </p>
          <div style={{ width: "100%", height: 320 }}>
            <ResponsiveContainer>
              <LineChart data={allData} margin={{ top: 10, right: 20, bottom: 0, left: 0 }}>
                <CartesianGrid stroke="#1a1a28" strokeDasharray="3 3" />
                <XAxis dataKey="year" stroke="#555" tick={{ fill: "#666", fontSize: 11 }} />
                <YAxis
                  stroke="#555"
                  tick={{ fill: "#666", fontSize: 11 }}
                  tickFormatter={(v) => fmt(Number(v))}
                />
                <Tooltip content={<CustomTooltip />} />
                {mode === "pct" ? (
                  selectedRates.map((r) => (
                    <Line
                      key={r}
                      type="monotone"
                      dataKey={`w${r}`}
                      name={`${r}% withdrawal`}
                      stroke={colorFor(r)}
                      strokeWidth={2}
                      dot={false}
                    />
                  ))
                ) : (
                  <Line
                    type="monotone"
                    dataKey={`w${fixedKey}`}
                    name="Annual withdrawal"
                    stroke={FIXED_COLOR}
                    strokeWidth={2}
                    dot={false}
                  />
                )}
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="section">
          <h2 className="section-title">
            {mode === "pct" ? "RATE COMPARISON SUMMARY" : "FIXED WITHDRAWAL SUMMARY"} ·{" "}
            {numYears}-YEAR HORIZON
          </h2>
          <div style={{ overflowX: "auto" }}>
            <table>
              <thead>
                <tr>
                  {[
                    mode === "pct" ? "Rate" : "Withdrawal",
                    "Yr 1 Monthly Exp",
                    `Yr ${numYears} Monthly Exp`,
                    `Portfolio Yr ${numYears}`,
                    "Status",
                  ].map((h) => (
                    <th key={h}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {summaryRows.map(
                  ({ label, yr1Withdrawal, lastWithdrawal, finalValue, depletedAt }, i) => {
                    const color = mode === "pct" ? COLORS[i] : FIXED_COLOR;
                    const status = depletedAt
                      ? `⚠ Depleted yr ${depletedAt}`
                      : finalValue > portfolio
                        ? "✓ Growing"
                        : "~ Declining";
                    const statusColor = depletedAt
                      ? "#ff6b6b"
                      : finalValue > portfolio
                        ? "#00ff87"
                        : "#ffbe0b";
                    return (
                      <tr key={label}>
                        <td style={{ color, fontWeight: 500 }}>{label}</td>
                        <td>{fmt(Math.round(yr1Withdrawal / 12))}</td>
                        <td
                          style={{
                            color: lastWithdrawal >= yr1Withdrawal ? "#00ff87" : "#ff6b6b",
                          }}
                        >
                          {fmt(Math.round(lastWithdrawal / 12))}
                        </td>
                        <td>{fmt(finalValue)}</td>
                        <td style={{ color: statusColor }}>{status}</td>
                      </tr>
                    );
                  },
                )}
              </tbody>
            </table>
          </div>
        </div>

        <p
          style={{
            textAlign: "center",
            color: "#444",
            fontSize: 11,
            marginTop: 32,
            letterSpacing: 1,
          }}
        >
          For illustrative purposes only · Not financial advice · Returns not guaranteed
        </p>
        </>)}
      </div>
      </div>
    </div>
  );
}
