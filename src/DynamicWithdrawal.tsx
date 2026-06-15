import { useEffect, useMemo, useRef, useState } from "react";
import {
  Area,
  Bar,
  CartesianGrid,
  ComposedChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

const DW_STORAGE_KEY = "dynamic-withdrawal-inputs";

// S&P 500 historical annual total returns 1985–currentYear
const HISTORICAL_RETURNS: Record<number, number> = {
  "2025": 17.71,
  "2024": 24.84,
  "2023": 26.11,
  "2022": -18.23,
  "2021": 28.53,
  "2020": 18.25,
  "2019": 31.33,
  "2018": -4.52,
  "2017": 21.67,
  "2016": 11.82,
  "2015": 1.25,
  "2014": 13.51,
  "2013": 32.18,
  "2012": 15.82,
  "2011": 1.97,
  "2010": 14.91,
  "2009": 26.49,
  "2008": -37.02,
  "2007": 5.39,
  "2006": 15.64,
  "2005": 4.77,
  "2004": 10.74,
  "2003": 28.5,
  "2002": -22.15,
  "2001": -12.02,
  "2000": -9.06,
  "1999": 21.07,
  "1998": 28.62,
  "1997": 33.19,
  "1996": 22.88,
  "1995": 37.45,
  "1994": 1.18,
  "1993": 9.89,
  "1992": 7.42,
  "1991": 30.22,
  "1990": -3.32,
  "1989": 31.36,
  "1988": 16.22,
  "1987": 4.71,
  "1986": 18.06,
  "1985": 31.23,
};

const DATA_YEARS = Object.keys(HISTORICAL_RETURNS)
  .map(Number)
  .sort((a, b) => a - b);
const MIN_YEAR = DATA_YEARS[0];
const MAX_YEAR = DATA_YEARS[DATA_YEARS.length - 1];

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
  cycled: boolean;
};

/**
 * Each year:
 *  1. Apply historical market return to portfolio
 *  2. Withdraw withdrawalRate% of the post-return portfolio value
 *  3. Remainder carries forward to next year
 * Simulation runs from startYear to MAX_YEAR (no cycling).
 */
function simulate(initialPortfolio: number, withdrawalRate: number, startYear: number): SimYear[] {
  const retirementYears = MAX_YEAR - startYear + 1;
  const result: SimYear[] = [];
  let portfolio = initialPortfolio;

  result.push({
    year: 0,
    calendarYear: startYear,
    portfolioBefore: portfolio,
    withdrawal: 0,
    portfolioAfter: portfolio,
    annualReturn: 0,
    cycled: false,
  });

  for (let y = 1; y <= retirementYears; y++) {
    const calendarYear = startYear + y - 1;
    const annualReturn = getHistoricalReturn(calendarYear);

    const portfolioBefore = portfolio * (1 + annualReturn / 100);
    const withdrawal = portfolioBefore * (withdrawalRate / 100);
    portfolio = portfolioBefore - withdrawal;

    result.push({
      year: y,
      calendarYear,
      portfolioBefore: Math.round(portfolioBefore),
      withdrawal: Math.round(withdrawal),
      portfolioAfter: Math.round(portfolio),
      annualReturn,
      cycled: false,
    });
  }

  return result;
}

const DWTooltip = ({
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
  const [draftRate, setDraftRate] = useState<number | "">(4);
  const [draftStartYear, setDraftStartYear] = useState<number>(2000);
  const lastEdited = useRef<"usd" | "ghs">("usd");

  const [portfolio, setPortfolio] = useState(500000);
  const [exchangeRate, setExchangeRate] = useState<number | null>(null);
  const [rate, setRate] = useState(4);
  const [startYear, setStartYear] = useState(2000);
  const [calculated, setCalculated] = useState(false);

  // Computed: always run from startYear to MAX_YEAR
  const years = MAX_YEAR - startYear + 1;

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(DW_STORAGE_KEY);
      if (!raw) return;
      const s = JSON.parse(raw) as {
        portfolio?: number;
        exchangeRate?: number;
        rate?: number;
        startYear?: number;
        portfolioGHS?: number;
      };
      const p = Math.max(1, Number(s.portfolio) || 500000);
      const er = s.exchangeRate && s.exchangeRate > 0 ? s.exchangeRate : null;
      const r = Math.max(0.1, Number(s.rate) || 4);
      const sy = Math.max(MIN_YEAR, Math.min(MAX_YEAR, Math.floor(Number(s.startYear) || 2000)));
      const ghs = s.portfolioGHS && s.portfolioGHS > 0 ? s.portfolioGHS : er ? p * er : "";
      setDraftPortfolio(p);
      setDraftRate(r);
      setDraftStartYear(sy);
      if (er) setDraftExchangeRate(er);
      if (ghs) setDraftPortfolioGHS(ghs);
      setPortfolio(p);
      setExchangeRate(er);
      setRate(r);
      setStartYear(sy);
      setCalculated(true);
    } catch {
      /* ignore */
    }
  }, []);

  const handleUSDChange = (val: string) => {
    const n = val === "" ? "" : +val;
    setDraftPortfolio(n);
    lastEdited.current = "usd";
    const er =
      typeof draftExchangeRate === "number" && draftExchangeRate > 0 ? draftExchangeRate : null;
    setDraftPortfolioGHS(typeof n === "number" && er ? n * er : "");
  };

  const handleGHSChange = (val: string) => {
    const n = val === "" ? "" : +val;
    setDraftPortfolioGHS(n);
    lastEdited.current = "ghs";
    const er =
      typeof draftExchangeRate === "number" && draftExchangeRate > 0 ? draftExchangeRate : null;
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

  const isDirty =
    Number(draftPortfolio) !== portfolio ||
    (Number(draftExchangeRate) || null) !== exchangeRate ||
    Number(draftRate) !== rate ||
    draftStartYear !== startYear;

  const handleCalculate = () => {
    const p = Math.max(1, Math.floor(Number(draftPortfolio) || 1));
    const er =
      typeof draftExchangeRate === "number" && draftExchangeRate > 0 ? draftExchangeRate : null;
    const r = Math.max(0.1, Number(draftRate) || 4);
    const sy = draftStartYear;
    const ghsVal =
      typeof draftPortfolioGHS === "number" && draftPortfolioGHS > 0
        ? draftPortfolioGHS
        : er
          ? p * er
          : null;
    setDraftPortfolio(p);
    setDraftRate(r);
    if (er) setDraftExchangeRate(er);
    if (ghsVal) setDraftPortfolioGHS(ghsVal);
    setPortfolio(p);
    setExchangeRate(er);
    setRate(r);
    setStartYear(sy);
    setCalculated(true);
    try {
      window.localStorage.setItem(
        DW_STORAGE_KEY,
        JSON.stringify({
          portfolio: p,
          exchangeRate: er,
          rate: r,
          startYear: sy,
          portfolioGHS: ghsVal,
        }),
      );
    } catch {
      /* ignore */
    }
  };

  const simData = useMemo(() => simulate(portfolio, rate, startYear), [portfolio, rate, startYear]);

  const lastRow = simData[simData.length - 1];
  const finalBalance = lastRow.portfolioAfter;
  const grew = finalBalance > portfolio;
  const withdrawalRows = simData.slice(1);
  const totalWithdrawn = withdrawalRows.reduce((s, d) => s + d.withdrawal, 0);
  const avgWithdrawal = withdrawalRows.length > 0 ? totalWithdrawn / withdrawalRows.length : 0;
  const minWithdrawal = Math.min(...withdrawalRows.map((d) => d.withdrawal));
  const maxWithdrawal = Math.max(...withdrawalRows.map((d) => d.withdrawal));
  const initWithdrawal = portfolio * (rate / 100);

  // CAGR: portfolio start-to-end compound annual growth rate
  const cagr =
    years > 0 && portfolio > 0 ? (Math.pow(finalBalance / portfolio, 1 / years) - 1) * 100 : 0;
  // Average monthly withdrawal
  const avgMonthlyWithdrawal = avgWithdrawal / 12;

  const retainedPct = (finalBalance / portfolio) * 100;
  const survivalStatus: "strong" | "survived" | "atrisk" | "depleted" =
    finalBalance >= portfolio
      ? "strong"
      : retainedPct >= 50
        ? "survived"
        : retainedPct >= 10
          ? "atrisk"
          : "depleted";
  const survivalLabel =
    survivalStatus === "strong"
      ? "THRIVING"
      : survivalStatus === "survived"
        ? "SURVIVED"
        : survivalStatus === "atrisk"
          ? "AT RISK"
          : "DEPLETED";
  const survivalColor =
    survivalStatus === "strong"
      ? "#00ff87"
      : survivalStatus === "survived"
        ? "#00d4ff"
        : survivalStatus === "atrisk"
          ? "#ffbe0b"
          : "#ff6b6b";
  const survivalSub =
    survivalStatus === "strong"
      ? `Portfolio grew ${retainedPct.toFixed(0)}% of start`
      : `${retainedPct.toFixed(1)}% of starting value remains`;

  const chartData = simData.map((d) => ({
    calendarYear: d.calendarYear,
    balance: d.portfolioAfter,
    withdrawal: d.withdrawal,
    return: d.annualReturn,
  }));

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
                : typeof draftPortfolio === "number" &&
                    typeof draftExchangeRate === "number" &&
                    draftExchangeRate > 0
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
            <span>Annual Withdrawal Rate (%)</span>
            <span className="slider-val">{Number(draftRate) || 0}%</span>
          </div>
          <input
            className="num-input"
            type="number"
            min={0.1}
            max={50}
            step={0.1}
            value={draftRate}
            onChange={(e) => setDraftRate(e.target.value === "" ? "" : +e.target.value)}
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
                {y} ({HISTORICAL_RETURNS[y] >= 0 ? "+" : ""}
                {HISTORICAL_RETURNS[y].toFixed(1)}%)
              </option>
            ))}
          </select>
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

      {/* Strategy note */}
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
        withdraw <span style={{ color: "#00ff87" }}>{rate}%</span> of whatever it is worth at that
        point. Simulation runs {MIN_YEAR}–{MAX_YEAR} using real S&P 500 returns.
      </div>

      {calculated && (
        <>
          {/* Summary */}
          <div className="section">
            <h2 className="section-title">
              RESULTS · START {startYear} → {MAX_YEAR} · {years} YEARS · {rate}% DYNAMIC WITHDRAWAL
            </h2>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))",
                gap: 12,
              }}
            >
              {/* Survival card */}
              <div
                style={{
                  background: "#0e0e18",
                  border: `2px solid ${survivalColor}44`,
                  borderRadius: 12,
                  padding: "18px 20px",
                  gridColumn: "span 1",
                }}
              >
                <div style={{ fontSize: 11, color: "#666", letterSpacing: 1.5, marginBottom: 6 }}>
                  SURVIVAL STATUS
                </div>
                <div
                  style={{
                    fontFamily: "'Bebas Neue', sans-serif",
                    fontSize: 36,
                    color: survivalColor,
                    lineHeight: 1,
                  }}
                >
                  {survivalLabel}
                </div>
                <div style={{ fontSize: 11, color: "#555", marginTop: 8 }}>{survivalSub}</div>
                <div
                  style={{
                    marginTop: 10,
                    height: 4,
                    background: "#1a1a28",
                    borderRadius: 2,
                    overflow: "hidden",
                  }}
                >
                  <div
                    style={{
                      height: "100%",
                      width: `${Math.min(100, retainedPct)}%`,
                      background: survivalColor,
                      borderRadius: 2,
                      transition: "width 0.4s",
                    }}
                  />
                </div>
              </div>

              <div
                style={{
                  background: "#0e0e18",
                  border: `1px solid ${grew ? "#00ff8733" : "#ffbe0b33"}`,
                  borderRadius: 12,
                  padding: "18px 20px",
                }}
              >
                <div style={{ fontSize: 11, color: "#666", letterSpacing: 1.5, marginBottom: 6 }}>
                  FINAL BALANCE
                </div>
                <div
                  style={{
                    fontFamily: "'Bebas Neue', sans-serif",
                    fontSize: 32,
                    color: grew ? "#00ff87" : "#ffbe0b",
                    lineHeight: 1,
                  }}
                >
                  {fmt(finalBalance)}
                </div>
                {exchangeRate && (
                  <div style={{ fontSize: 12, color: "#888", marginTop: 4 }}>
                    {fmtGHS(finalBalance, exchangeRate)}
                  </div>
                )}
                <div style={{ fontSize: 11, color: "#555", marginTop: 6 }}>
                  {grew
                    ? `▲ ${fmt(finalBalance - portfolio)} above start`
                    : `▼ ${fmt(portfolio - finalBalance)} below start`}
                </div>
              </div>
              {/* TOTAL PORTFOLIO PERFORMANCE */}
              <div
                style={{
                  background: "#0e0e18",
                  border: "1px solid #00ff8733",
                  borderRadius: 12,
                  padding: "18px 20px",
                }}
              >
                {(() => {
                  const perfPct = ((finalBalance - portfolio) / portfolio) * 100;
                  const isPos = perfPct >= 0;
                  return (
                    <>
                      <div
                        style={{ fontSize: 11, color: "#666", letterSpacing: 1.5, marginBottom: 6 }}
                      >
                        PORTFOLIO PERFORMANCE
                      </div>
                      <div
                        style={{
                          fontFamily: "'Bebas Neue', sans-serif",
                          fontSize: 28,
                          color: isPos ? "#00ff87" : "#ff6b6b",
                          lineHeight: 1,
                        }}
                      >
                        {isPos ? "+" : ""}
                        {perfPct.toFixed(1)}%
                      </div>
                      <div style={{ fontSize: 12, color: "#aaa", marginTop: 6 }}>
                        {fmt(portfolio)} → {fmt(finalBalance)}
                      </div>
                      {exchangeRate && (
                        <div style={{ fontSize: 11, color: "#888", marginTop: 2 }}>
                          {fmtGHS(portfolio, exchangeRate)} → {fmtGHS(finalBalance, exchangeRate)}
                        </div>
                      )}
                      <div style={{ fontSize: 11, color: "#555", marginTop: 4 }}>
                        Initial value vs final balance
                      </div>
                    </>
                  );
                })()}
              </div>

              {/* CAGR card */}
              <div
                style={{
                  background: "#0e0e18",
                  border: "1px solid #00ff8733",
                  borderRadius: 12,
                  padding: "18px 20px",
                }}
              >
                <div style={{ fontSize: 11, color: "#666", letterSpacing: 1.5, marginBottom: 6 }}>
                  PORTFOLIO CAGR
                </div>
                <div
                  style={{
                    fontFamily: "'Bebas Neue', sans-serif",
                    fontSize: 32,
                    color: cagr >= 0 ? "#00ff87" : "#ff6b6b",
                    lineHeight: 1,
                  }}
                >
                  {cagr >= 0 ? "+" : ""}
                  {cagr.toFixed(2)}%
                </div>
                <div style={{ fontSize: 11, color: "#555", marginTop: 6 }}>
                  Compound annual growth
                </div>
              </div>

              {/* Avg monthly withdrawal card */}
              <div
                style={{
                  background: "#0e0e18",
                  border: "1px solid #8338ec33",
                  borderRadius: 12,
                  padding: "18px 20px",
                }}
              >
                <div style={{ fontSize: 11, color: "#666", letterSpacing: 1.5, marginBottom: 6 }}>
                  AVG MONTHLY WITHDRAWAL
                </div>
                <div
                  style={{
                    fontFamily: "'Bebas Neue', sans-serif",
                    fontSize: 32,
                    color: "#8338ec",
                    lineHeight: 1,
                  }}
                >
                  {fmt(avgMonthlyWithdrawal)}
                </div>
                {exchangeRate && (
                  <div style={{ fontSize: 12, color: "#888", marginTop: 4 }}>
                    {fmtGHS(avgMonthlyWithdrawal, exchangeRate)}/mo
                  </div>
                )}
                <div style={{ fontSize: 11, color: "#555", marginTop: 6 }}>Avg annual ÷ 12</div>
              </div>

              <div
                style={{
                  background: "#0e0e18",
                  border: "1px solid #00d4ff33",
                  borderRadius: 12,
                  padding: "18px 20px",
                }}
              >
                <div style={{ fontSize: 11, color: "#666", letterSpacing: 1.5, marginBottom: 6 }}>
                  AVG ANNUAL WITHDRAWAL
                </div>
                <div
                  style={{
                    fontFamily: "'Bebas Neue', sans-serif",
                    fontSize: 28,
                    color: "#00d4ff",
                    lineHeight: 1,
                  }}
                >
                  {fmt(avgWithdrawal)}
                </div>
                {exchangeRate && (
                  <div style={{ fontSize: 12, color: "#888", marginTop: 4 }}>
                    {fmtGHS(avgWithdrawal, exchangeRate)}/yr
                  </div>
                )}
                <div style={{ fontSize: 11, color: "#555", marginTop: 6 }}>Over {years} years</div>
              </div>

              <div
                style={{
                  background: "#0e0e18",
                  border: "1px solid #ffbe0b33",
                  borderRadius: 12,
                  padding: "18px 20px",
                }}
              >
                <div style={{ fontSize: 11, color: "#666", letterSpacing: 1.5, marginBottom: 6 }}>
                  TOTAL WITHDRAWN
                </div>
                <div
                  style={{
                    fontFamily: "'Bebas Neue', sans-serif",
                    fontSize: 28,
                    color: "#ffbe0b",
                    lineHeight: 1,
                  }}
                >
                  {fmt(totalWithdrawn)}
                </div>
                {exchangeRate && (
                  <div style={{ fontSize: 12, color: "#888", marginTop: 4 }}>
                    {fmtGHS(totalWithdrawn, exchangeRate)}
                  </div>
                )}
                <div style={{ fontSize: 11, color: "#555", marginTop: 6 }}>
                  From {fmt(portfolio)} portfolio
                </div>
              </div>
            </div>
          </div>

          {/* Chart */}
          <div className="section">
            <h2 className="section-title">PORTFOLIO BALANCE & ANNUAL WITHDRAWAL</h2>
            <p style={{ color: "#666", fontSize: 12, marginTop: -8, marginBottom: 14 }}>
              Balance (area, left axis) · Withdrawal (bars, right axis) · Red shade =
              negative-return years
            </p>
            <div style={{ width: "100%", height: 380 }}>
              <ResponsiveContainer>
                <ComposedChart
                  data={chartData}
                  margin={{ top: 10, right: 20, bottom: 20, left: 0 }}
                >
                  <defs>
                    <linearGradient id="dwGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#00d4ff" stopOpacity={0.18} />
                      <stop offset="95%" stopColor="#00d4ff" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke="#1a1a28" strokeDasharray="3 3" />
                  <XAxis
                    dataKey="calendarYear"
                    stroke="#555"
                    tick={{ fill: "#666", fontSize: 11 }}
                    label={{
                      value: "Year",
                      position: "insideBottom",
                      offset: -10,
                      fill: "#555",
                      fontSize: 11,
                    }}
                  />
                  <YAxis
                    yAxisId="bal"
                    stroke="#555"
                    tick={{ fill: "#666", fontSize: 11 }}
                    tickFormatter={(v) => fmt(Number(v))}
                  />
                  <YAxis
                    yAxisId="wd"
                    orientation="right"
                    stroke="#555"
                    tick={{ fill: "#666", fontSize: 11 }}
                    tickFormatter={(v) => fmt(Number(v))}
                  />
                  <Tooltip content={<DWTooltip exchangeRate={exchangeRate} />} />
                  {chartData
                    .filter((d) => d.return < 0)
                    .map((d) => (
                      <ReferenceLine
                        key={`neg-${d.calendarYear}`}
                        yAxisId="bal"
                        x={d.calendarYear}
                        stroke="#ff6b6b"
                        strokeOpacity={0.12}
                        strokeWidth={24}
                      />
                    ))}
                  <Area
                    yAxisId="bal"
                    type="monotone"
                    dataKey="balance"
                    name="Balance"
                    stroke="#00d4ff"
                    strokeWidth={2.5}
                    fill="url(#dwGrad)"
                    dot={false}
                    activeDot={{ r: 4, fill: "#00d4ff" }}
                  />
                  <Bar
                    yAxisId="wd"
                    dataKey="withdrawal"
                    name="Withdrawal"
                    fill="#ffbe0b"
                    fillOpacity={0.55}
                    radius={[2, 2, 0, 0]}
                    maxBarSize={16}
                  />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Year-by-year table */}
          <div className="section">
            <h2 className="section-title">YEAR-BY-YEAR DETAIL</h2>
            <div style={{ overflowX: "auto" }}>
              <table style={{ borderCollapse: "separate", borderSpacing: 0 }}>
                <thead>
                  <tr>
                    <th style={{ position: "sticky", left: 0, zIndex: 2, background: "#0a0a14", whiteSpace: "nowrap" }}>Year</th>
                    <th style={{ position: "sticky", left: 72, zIndex: 2, background: "#0a0a14", whiteSpace: "nowrap", boxShadow: "4px 0 8px #000a" }}>Return</th>
                    <th style={{ background: "#0a0a14" }}>Value Before Withdrawal</th>
                    <th style={{ background: "#0a0a14" }}>Annual Withdrawal (USD)</th>
                    {exchangeRate && <th style={{ background: "#0a0a14" }}>Monthly GHS Withdrawal</th>}
                    <th style={{ background: "#0a0a14" }}>Value After Withdrawal</th>
                  </tr>
                </thead>
                <tbody>
                  {simData.map((d) => {
                    const retColor =
                      d.annualReturn < 0 ? "#ff6b6b" : d.annualReturn > 20 ? "#00ff87" : "#aaa";
                    const balColor =
                      d.portfolioAfter > portfolio
                        ? "#00ff87"
                        : d.portfolioAfter > portfolio * 0.5
                          ? "#00d4ff"
                          : d.portfolioAfter > portfolio * 0.25
                            ? "#ffbe0b"
                            : "#ff6b6b";
                    const monthlyGHSWithdrawal =
                      exchangeRate && d.year > 0 ? (d.withdrawal / 12) * exchangeRate : null;
                    const rowBg = "#0a0a14";
                    return (
                      <tr key={d.year}>
                        <td style={{ color: "#888", position: "sticky", left: 0, zIndex: 1, background: rowBg, whiteSpace: "nowrap" }}>
                          {d.year === 0 ? "Start" : d.calendarYear}
                        </td>
                        <td style={{ color: retColor, fontWeight: 500, position: "sticky", left: 72, zIndex: 1, background: rowBg, whiteSpace: "nowrap", boxShadow: "4px 0 8px #000a" }}>
                          {d.year === 0
                            ? "—"
                            : `${d.annualReturn >= 0 ? "+" : ""}${d.annualReturn.toFixed(1)}%`}
                        </td>
                        <td style={{ color: "#aaa", background: rowBg }}>
                          {d.year === 0 ? fmt(d.portfolioAfter) : fmt(d.portfolioBefore)}
                        </td>
                        <td style={{ color: "#ffbe0b", fontWeight: 500, background: rowBg }}>
                          {d.year === 0 ? "—" : fmt(d.withdrawal)}
                        </td>
                        {exchangeRate && (
                          <td style={{ color: "#00ff87", fontSize: 12, background: rowBg }}>
                            {monthlyGHSWithdrawal !== null
                              ? `₵${Math.round(monthlyGHSWithdrawal).toLocaleString()}/mo`
                              : "—"}
                          </td>
                        )}
                        <td style={{ color: balColor, fontWeight: 500, background: rowBg }}>
                          {fmt(d.portfolioAfter)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Footer meta */}
          <div
            className="section"
            style={{
              background: "#0a0a14",
              border: "1px solid #1a1a28",
              borderRadius: 12,
              padding: "16px 20px",
            }}
          >
            <div style={{ display: "flex", gap: 24, flexWrap: "wrap", fontSize: 12 }}>
              <div>
                <span style={{ color: "#555", letterSpacing: 1 }}>DATA SOURCE</span>
                <span style={{ color: "#aaa", marginLeft: 10 }}>
                  S&P 500 Total Return {MIN_YEAR}–{MAX_YEAR}
                </span>
              </div>
              <div>
                <span style={{ color: "#555", letterSpacing: 1 }}>WITHDRAWAL RULE</span>
                <span style={{ color: "#00ff87", marginLeft: 10 }}>
                  {rate}% of current portfolio value each year
                </span>
              </div>
              <div>
                <span style={{ color: "#555", letterSpacing: 1 }}>SEQUENCE TESTED</span>
                <span style={{ color: "#aaa", marginLeft: 10 }}>
                  {startYear} → {MAX_YEAR}
                </span>
              </div>
            </div>
          </div>
        </>
      )}

      {!calculated && (
        <div
          className="section"
          style={{ textAlign: "center", padding: "40px 22px", color: "#444" }}
        >
          <div style={{ fontSize: 36, marginBottom: 12 }}>📈</div>
          <div style={{ fontSize: 14, letterSpacing: 1 }}>
            Enter your details above and press CALCULATE to run the historical simulation
          </div>
        </div>
      )}
    </div>
  );
}
