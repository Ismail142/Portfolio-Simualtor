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

const GB_STORAGE_KEY = "gain-based-withdrawal-inputs";

const HISTORICAL_RETURNS: Record<number, number> = {
  2025: 17.88, 2024: 25.02, 2023: 26.29, 2022: -18.11, 2021: 28.71,
  2020: 18.4,  2019: 31.49, 2018: -4.38, 2017: 21.83,  2016: 11.96,
  2015: 1.38,  2014: 13.69, 2013: 32.39, 2012: 16.0,   2011: 2.11,
  2010: 15.06, 2009: 26.46, 2008: -37.0, 2007: 5.49,   2006: 15.79,
  2005: 4.91,  2004: 10.88, 2003: 28.68, 2002: -22.1,  2001: -11.89,
  2000: -9.1,  1999: 21.04, 1998: 28.58, 1997: 33.36,  1996: 22.96,
  1995: 37.58, 1994: 1.32,  1993: 10.08, 1992: 7.62,   1991: 30.47,
  1990: -3.1,  1989: 31.69, 1988: 16.61, 1987: 5.25,   1986: 18.67,
  1985: 31.73, 1984: 6.27,  1983: 22.56, 1982: 21.55,  1981: -4.91,
  1980: 32.42, 1979: 18.44, 1978: 6.56,  1977: -7.18,  1976: 23.84,
  1975: 37.2,  1974: -26.47,1973: -14.66,1972: 18.98,  1971: 14.31,
  1970: 4.01,  1969: -8.5,  1968: 11.06, 1967: 23.98,  1966: -10.06,
  1965: 12.45, 1964: 16.48, 1963: 22.8,  1962: -8.73,  1961: 26.89,
  1960: 0.47,  1959: 11.96, 1958: 43.36, 1957: -10.78, 1956: 6.56,
  1955: 31.56, 1954: 52.62, 1953: -0.99, 1952: 18.37,  1951: 24.02,
  1950: 31.71, 1949: 18.79, 1948: 5.5,   1947: 5.71,   1946: -8.07,
  1945: 36.44, 1944: 19.75, 1943: 25.9,  1942: 20.34,  1941: -11.59,
  1940: -9.78, 1939: -0.41, 1938: 31.12, 1937: -35.03, 1936: 33.92,
  1935: 47.67, 1934: -1.44, 1933: 53.99, 1932: -8.19,  1931: -43.34,
  1930: -24.9, 1929: -8.42, 1928: 43.61, 1927: 37.49,  1926: 11.62,
};

const DATA_YEARS = Object.keys(HISTORICAL_RETURNS).map(Number).sort((a, b) => a - b);
const MIN_YEAR = DATA_YEARS[0];
const MAX_YEAR = DATA_YEARS[DATA_YEARS.length - 1];

function getHistoricalReturn(yr: number): number {
  return HISTORICAL_RETURNS[yr] ?? 0;
}

function getWithdrawalRate(gainPct: number): number {
  if (gainPct >= 75) return 8;
  if (gainPct >= 50) return 7;
  if (gainPct >= 25) return 6;
  if (gainPct >= 0)  return 5;
  return 4;
}

const RATE_COLORS: Record<number, string> = {
  8: "#00ff87",
  7: "#00d4ff",
  6: "#ffbe0b",
  5: "#ff6b6b",
  4: "#8338ec",
};

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

type GBSimYear = {
  year: number;
  calendarYear: number;
  portfolioBefore: number;
  gainPct: number;
  withdrawalRate: number;
  withdrawal: number;
  portfolioAfter: number;
  annualReturn: number;
};

function simulate(
  initialPortfolio: number,
  costBasis: number,
  startYear: number,
  endYear: number,
): GBSimYear[] {
  let portfolio = initialPortfolio;
  const result: GBSimYear[] = [];
  const initGain = ((initialPortfolio - costBasis) / costBasis) * 100;

  result.push({
    year: 0,
    calendarYear: startYear,
    portfolioBefore: portfolio,
    gainPct: initGain,
    withdrawalRate: getWithdrawalRate(initGain),
    withdrawal: 0,
    portfolioAfter: portfolio,
    annualReturn: 0,
  });

  const totalYears = endYear - startYear + 1;
  for (let y = 1; y <= totalYears; y++) {
    const calendarYear = startYear + y - 1;
    const annualReturn = getHistoricalReturn(calendarYear);
    const gainPct = ((portfolio - costBasis) / costBasis) * 100;
    const withdrawalRate = getWithdrawalRate(gainPct);
    const portfolioBefore = portfolio;
    const withdrawal = portfolioBefore * (withdrawalRate / 100);
    const afterWithdrawal = portfolioBefore - withdrawal;
    portfolio = afterWithdrawal * (1 + annualReturn / 100);

    result.push({
      year: y,
      calendarYear,
      portfolioBefore: Math.round(portfolioBefore),
      gainPct,
      withdrawalRate,
      withdrawal: Math.round(withdrawal),
      portfolioAfter: Math.round(portfolio),
      annualReturn,
    });
  }
  return result;
}

function GBTooltip({
  active,
  payload,
  label,
  exchangeRate,
}: {
  active?: boolean;
  payload?: { name: string; value: number; color: string }[];
  label?: number;
  exchangeRate: number | null;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div
      style={{
        background: "#0e0e18",
        border: "1px solid #1a1a28",
        borderRadius: 8,
        padding: "10px 14px",
        fontSize: 12,
        fontFamily: "'DM Mono', monospace",
      }}
    >
      <div style={{ color: "#888", marginBottom: 6 }}>{label}</div>
      {payload.map((p, i) => {
        const ghs = fmtGHS(p.value, exchangeRate);
        return (
          <div key={i} style={{ color: p.color, lineHeight: 1.9 }}>
            {p.name}: {fmt(p.value)}
            {ghs ? <span style={{ color: "#666", fontSize: 10 }}> · {ghs}</span> : null}
          </div>
        );
      })}
    </div>
  );
}

export default function GainBasedWithdrawal() {
  const [draftPortfolio, setDraftPortfolio] = useState<number | "">(500000);
  const [draftPortfolioGHS, setDraftPortfolioGHS] = useState<number | "">("");
  const [draftCostBasis, setDraftCostBasis] = useState<number | "">(300000);
  const [draftExchangeRate, setDraftExchangeRate] = useState<number | "">(15);
  const [draftStartYear, setDraftStartYear] = useState<number>(2000);
  const [draftDuration, setDraftDuration] = useState<number | "">(30);
  const lastEdited = useRef<"usd" | "ghs">("usd");

  const [portfolio, setPortfolio] = useState(500000);
  const [costBasis, setCostBasis] = useState(300000);
  const [exchangeRate, setExchangeRate] = useState<number | null>(null);
  const [startYear, setStartYear] = useState(2000);
  const [duration, setDuration] = useState<number | null>(30);
  const [calculated, setCalculated] = useState(false);

  const endYear = duration === null ? MAX_YEAR : Math.min(startYear + duration - 1, MAX_YEAR);
  const years = endYear - startYear + 1;
  const draftEndYear = draftDuration === "" ? MAX_YEAR : Math.min(draftStartYear + (draftDuration as number) - 1, MAX_YEAR);
  const isCapped = draftDuration !== "" && draftStartYear + (draftDuration as number) - 1 > MAX_YEAR;

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(GB_STORAGE_KEY);
      if (!raw) return;
      const s = JSON.parse(raw) as {
        portfolio?: number;
        costBasis?: number;
        exchangeRate?: number;
        startYear?: number;
        duration?: number;
        portfolioGHS?: number;
      };
      const p = Math.max(1, Number(s.portfolio) || 500000);
      const cb = Math.max(1, Number(s.costBasis) || 300000);
      const er = s.exchangeRate && s.exchangeRate > 0 ? s.exchangeRate : null;
      const sy = Math.max(MIN_YEAR, Math.min(MAX_YEAR, Math.floor(Number(s.startYear) || 2000)));
      const dur = s.duration != null ? Math.max(1, Math.floor(Number(s.duration))) : null;
      const ghs = s.portfolioGHS && s.portfolioGHS > 0 ? s.portfolioGHS : er ? p * er : "";
      setDraftPortfolio(p);
      setDraftCostBasis(cb);
      setDraftStartYear(sy);
      setDraftDuration(dur ?? "");
      if (er) setDraftExchangeRate(er);
      if (ghs) setDraftPortfolioGHS(ghs);
      setPortfolio(p);
      setCostBasis(cb);
      setExchangeRate(er);
      setStartYear(sy);
      setDuration(dur);
      setCalculated(true);
    } catch { }
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

  const draftDurationVal = draftDuration === "" ? null : draftDuration;
  const isDirty =
    Number(draftPortfolio) !== portfolio ||
    Number(draftCostBasis) !== costBasis ||
    (Number(draftExchangeRate) || null) !== exchangeRate ||
    draftStartYear !== startYear ||
    draftDurationVal !== duration;

  const handleCalculate = () => {
    const p = Math.max(1, Math.floor(Number(draftPortfolio) || 1));
    const cb = Math.max(1, Math.floor(Number(draftCostBasis) || 1));
    const er = typeof draftExchangeRate === "number" && draftExchangeRate > 0 ? draftExchangeRate : null;
    const sy = draftStartYear;
    const dur = draftDuration === "" ? null : Math.max(1, Math.floor(Number(draftDuration)));
    const ghsVal =
      typeof draftPortfolioGHS === "number" && draftPortfolioGHS > 0
        ? draftPortfolioGHS
        : er ? p * er : null;
    setDraftPortfolio(p);
    setDraftCostBasis(cb);
    setDraftDuration(dur ?? "");
    if (er) setDraftExchangeRate(er);
    if (ghsVal) setDraftPortfolioGHS(ghsVal);
    setPortfolio(p);
    setCostBasis(cb);
    setExchangeRate(er);
    setStartYear(sy);
    setDuration(dur);
    setCalculated(true);
    try {
      window.localStorage.setItem(GB_STORAGE_KEY, JSON.stringify({
        portfolio: p, costBasis: cb, exchangeRate: er, startYear: sy,
        duration: dur ?? null, portfolioGHS: ghsVal,
      }));
    } catch { }
  };

  const simData = useMemo(
    () => simulate(portfolio, costBasis, startYear, endYear),
    [portfolio, costBasis, startYear, endYear],
  );

  const lastRow = simData[simData.length - 1];
  const finalBalance = lastRow.portfolioAfter;
  const grew = finalBalance > portfolio;
  const withdrawalRows = simData.slice(1);
  const totalWithdrawn = withdrawalRows.reduce((s, d) => s + d.withdrawal, 0);
  const avgWithdrawal = withdrawalRows.length > 0 ? totalWithdrawn / withdrawalRows.length : 0;
  const avgMonthlyWithdrawal = avgWithdrawal / 12;

  const cagr =
    years > 0 && portfolio > 0 ? (Math.pow(finalBalance / portfolio, 1 / years) - 1) * 100 : 0;

  const retainedPct = (finalBalance / portfolio) * 100;
  const survivalStatus: "strong" | "survived" | "atrisk" | "depleted" =
    finalBalance >= portfolio ? "strong"
      : retainedPct >= 50 ? "survived"
        : retainedPct >= 10 ? "atrisk"
          : "depleted";
  const survivalLabel =
    survivalStatus === "strong" ? "THRIVING"
      : survivalStatus === "survived" ? "SURVIVED"
        : survivalStatus === "atrisk" ? "AT RISK"
          : "DEPLETED";
  const survivalColor =
    survivalStatus === "strong" ? "#00ff87"
      : survivalStatus === "survived" ? "#00d4ff"
        : survivalStatus === "atrisk" ? "#ffbe0b"
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

  const initGain = ((portfolio - costBasis) / costBasis) * 100;

  return (
    <div style={{ maxWidth: 1200, margin: "0 auto" }}>
      <style>{`
        .gb-table { min-width: 700px; }
        .gb-table th, .gb-table td { background: #0a0a14; }
        .gb-table th:nth-child(1), .gb-table td:nth-child(1) {
          position: sticky; left: 0; z-index: 2; min-width: 72px; white-space: nowrap;
        }
        .gb-table th:nth-child(2), .gb-table td:nth-child(2) {
          position: sticky; left: 72px; z-index: 2; white-space: nowrap;
          box-shadow: 4px 0 10px rgba(0,0,0,0.7);
          clip-path: inset(0px -20px 0px 0px);
        }
        .gb-table tr:hover td { background: #0e0e1a; }
      `}</style>

      {/* Inputs */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))", gap: 16 }}>
        <div className="stat-card slider-wrap">
          <div className="slider-label">
            <span>Portfolio Value (USD)</span>
            <span className="slider-val">{fmt(Number(draftPortfolio) || 0)}</span>
          </div>
          <input
            className="num-input" type="number" min={1} step={10000}
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
            className="num-input" type="number" min={1} step={10000}
            placeholder="e.g. 7500000"
            value={typeof draftPortfolioGHS === "number" && draftPortfolioGHS > 0 ? parseFloat(draftPortfolioGHS.toFixed(2)) : ""}
            onChange={(e) => handleGHSChange(e.target.value)}
          />
        </div>

        <div className="stat-card slider-wrap">
          <div className="slider-label">
            <span>Cost Basis / Total Invested (USD)</span>
            <span className="slider-val">{fmt(Number(draftCostBasis) || 0)}</span>
          </div>
          <input
            className="num-input" type="number" min={1} step={10000}
            value={draftCostBasis}
            onChange={(e) => setDraftCostBasis(e.target.value === "" ? "" : +e.target.value)}
          />
          <div style={{ fontSize: 11, color: "#555", letterSpacing: 1, marginTop: 4 }}>
            {typeof draftPortfolio === "number" && typeof draftCostBasis === "number" && draftCostBasis > 0
              ? (() => {
                  const g = ((draftPortfolio - draftCostBasis) / draftCostBasis) * 100;
                  const rate = getWithdrawalRate(g);
                  return `CURRENT GAIN: ${g >= 0 ? "+" : ""}${g.toFixed(1)}% → ${rate}% RATE`;
                })()
              : "AMOUNT ORIGINALLY INVESTED"}
          </div>
        </div>

        <div className="stat-card slider-wrap">
          <div className="slider-label">
            <span>USD → GHS Rate</span>
            <span className="slider-val">
              {typeof draftExchangeRate === "number" ? `×${draftExchangeRate}` : "—"}
            </span>
          </div>
          <input
            className="num-input" type="number" min={0} step={0.1} placeholder="15"
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
              width: "100%", background: "#07070d", border: "1px solid #1a1a28",
              color: "#00ff87", fontFamily: "'DM Mono', monospace", fontSize: 15,
              padding: "8px 10px", borderRadius: 6, outline: "none", cursor: "pointer",
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
              {isCapped && <span style={{ color: "#ffbe0b", fontSize: 11, marginLeft: 6 }}>→ capped {MAX_YEAR}</span>}
            </span>
          </div>
          <input
            className="num-input" type="number" min={1} max={100} step={1}
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
        <button className="calc-btn" type="button" onClick={handleCalculate} disabled={!isDirty && calculated}>
          CALCULATE
        </button>
      </div>

      {/* Strategy note with rate table */}
      <div style={{ background: "#0a0a14", border: "1px solid #15151f", borderRadius: 10, padding: "14px 18px", marginTop: 12, fontSize: 12, color: "#555", lineHeight: 1.8 }}>
        <span style={{ color: "#888", letterSpacing: 1 }}>STRATEGY · </span>
        Withdrawal rate adjusts each year based on portfolio gain vs cost basis.
        Withdrawal is taken at the start of each year, then market returns apply to the remainder.
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10 }}>
          {[
            { label: "≥ +75%", rate: 8, color: RATE_COLORS[8] },
            { label: "+50–74%", rate: 7, color: RATE_COLORS[7] },
            { label: "+25–49%", rate: 6, color: RATE_COLORS[6] },
            { label: "0–24%", rate: 5, color: RATE_COLORS[5] },
            { label: "< 0%", rate: 4, color: RATE_COLORS[4] },
          ].map(({ label, rate, color }) => (
            <div key={rate} style={{ background: "#0e0e18", border: `1px solid ${color}44`, borderRadius: 6, padding: "4px 10px", display: "flex", gap: 8, alignItems: "center" }}>
              <span style={{ color: "#666" }}>{label}</span>
              <span style={{ color, fontWeight: 600 }}>{rate}%</span>
            </div>
          ))}
        </div>
      </div>

      {calculated && (
        <>
          {/* Summary */}
          <div className="section">
            <h2 className="section-title">
              RESULTS · START {startYear} → {endYear} · {years} YEARS · GAIN-BASED WITHDRAWAL
            </h2>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: 12 }}>

              {/* Survival */}
              <div style={{ background: "#0e0e18", border: `2px solid ${survivalColor}44`, borderRadius: 12, padding: "18px 20px" }}>
                <div style={{ fontSize: 11, color: "#666", letterSpacing: 1.5, marginBottom: 6 }}>SURVIVAL STATUS</div>
                <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 36, color: survivalColor, lineHeight: 1 }}>{survivalLabel}</div>
                <div style={{ fontSize: 11, color: "#555", marginTop: 8 }}>{survivalSub}</div>
                <div style={{ marginTop: 10, height: 4, background: "#1a1a28", borderRadius: 2, overflow: "hidden" }}>
                  <div style={{ height: "100%", width: `${Math.min(100, retainedPct)}%`, background: survivalColor, borderRadius: 2, transition: "width 0.4s" }} />
                </div>
              </div>

              {/* Final balance */}
              <div style={{ background: "#0e0e18", border: `1px solid ${grew ? "#00ff8733" : "#ffbe0b33"}`, borderRadius: 12, padding: "18px 20px" }}>
                <div style={{ fontSize: 11, color: "#666", letterSpacing: 1.5, marginBottom: 6 }}>FINAL BALANCE</div>
                <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 32, color: grew ? "#00ff87" : "#ffbe0b", lineHeight: 1 }}>{fmt(finalBalance)}</div>
                {exchangeRate && <div style={{ fontSize: 12, color: "#888", marginTop: 4 }}>{fmtGHS(finalBalance, exchangeRate)}</div>}
                <div style={{ fontSize: 11, color: "#555", marginTop: 6 }}>
                  {grew ? `▲ ${fmt(finalBalance - portfolio)} above start` : `▼ ${fmt(portfolio - finalBalance)} below start`}
                </div>
              </div>

              {/* Initial gain bracket */}
              <div style={{ background: "#0e0e18", border: `1px solid ${RATE_COLORS[getWithdrawalRate(initGain)]}33`, borderRadius: 12, padding: "18px 20px" }}>
                <div style={{ fontSize: 11, color: "#666", letterSpacing: 1.5, marginBottom: 6 }}>OPENING GAIN VS COST BASIS</div>
                <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 32, color: RATE_COLORS[getWithdrawalRate(initGain)], lineHeight: 1 }}>
                  {initGain >= 0 ? "+" : ""}{initGain.toFixed(1)}%
                </div>
                <div style={{ fontSize: 12, color: "#aaa", marginTop: 6 }}>
                  {fmt(costBasis)} → {fmt(portfolio)}
                </div>
                <div style={{ fontSize: 11, color: "#555", marginTop: 4 }}>
                  Opens at {getWithdrawalRate(initGain)}% withdrawal rate
                </div>
              </div>

              {/* CAGR */}
              <div style={{ background: "#0e0e18", border: "1px solid #00ff8733", borderRadius: 12, padding: "18px 20px" }}>
                <div style={{ fontSize: 11, color: "#666", letterSpacing: 1.5, marginBottom: 6 }}>PORTFOLIO CAGR</div>
                <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 32, color: cagr >= 0 ? "#00ff87" : "#ff6b6b", lineHeight: 1 }}>
                  {cagr >= 0 ? "+" : ""}{cagr.toFixed(2)}%
                </div>
                <div style={{ fontSize: 11, color: "#555", marginTop: 6 }}>Compound annual growth</div>
              </div>

              {/* Avg monthly */}
              <div style={{ background: "#0e0e18", border: "1px solid #8338ec33", borderRadius: 12, padding: "18px 20px" }}>
                <div style={{ fontSize: 11, color: "#666", letterSpacing: 1.5, marginBottom: 6 }}>AVG MONTHLY WITHDRAWAL</div>
                <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 32, color: "#8338ec", lineHeight: 1 }}>
                  {fmt(avgMonthlyWithdrawal)}
                </div>
                {exchangeRate && <div style={{ fontSize: 12, color: "#888", marginTop: 4 }}>{fmtGHS(avgMonthlyWithdrawal, exchangeRate)}/mo</div>}
                <div style={{ fontSize: 11, color: "#555", marginTop: 6 }}>Avg annual ÷ 12</div>
              </div>

              {/* Total withdrawn */}
              <div style={{ background: "#0e0e18", border: "1px solid #ffbe0b33", borderRadius: 12, padding: "18px 20px" }}>
                <div style={{ fontSize: 11, color: "#666", letterSpacing: 1.5, marginBottom: 6 }}>TOTAL WITHDRAWN</div>
                <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 28, color: "#ffbe0b", lineHeight: 1 }}>
                  {fmt(totalWithdrawn)}
                </div>
                {exchangeRate && <div style={{ fontSize: 12, color: "#888", marginTop: 4 }}>{fmtGHS(totalWithdrawn, exchangeRate)}</div>}
                <div style={{ fontSize: 11, color: "#555", marginTop: 6 }}>From {fmt(portfolio)} portfolio</div>
              </div>
            </div>
          </div>

          {/* Chart */}
          <div className="section">
            <h2 className="section-title">PORTFOLIO BALANCE & ANNUAL WITHDRAWAL</h2>
            <p style={{ color: "#666", fontSize: 12, marginTop: -8, marginBottom: 14 }}>
              Balance (area, left axis) · Withdrawal (bars, right axis) · Red shade = negative-return years
            </p>
            <div style={{ width: "100%", height: 380 }}>
              <ResponsiveContainer>
                <ComposedChart data={chartData} margin={{ top: 10, right: 20, bottom: 20, left: 0 }}>
                  <defs>
                    <linearGradient id="gbGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#00ff87" stopOpacity={0.18} />
                      <stop offset="95%" stopColor="#00ff87" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke="#1a1a28" strokeDasharray="3 3" />
                  <XAxis dataKey="calendarYear" stroke="#555" tick={{ fill: "#666", fontSize: 11 }}
                    label={{ value: "Year", position: "insideBottom", offset: -10, fill: "#555", fontSize: 11 }} />
                  <YAxis yAxisId="bal" stroke="#555" tick={{ fill: "#666", fontSize: 11 }} tickFormatter={(v) => fmt(Number(v))} />
                  <YAxis yAxisId="wd" orientation="right" stroke="#555" tick={{ fill: "#666", fontSize: 11 }} tickFormatter={(v) => fmt(Number(v))} />
                  <Tooltip content={<GBTooltip exchangeRate={exchangeRate} />} />
                  {chartData.filter((d) => d.return < 0).map((d) => (
                    <ReferenceLine key={`neg-${d.calendarYear}`} yAxisId="bal" x={d.calendarYear}
                      stroke="#ff6b6b" strokeOpacity={0.12} strokeWidth={24} />
                  ))}
                  <Area yAxisId="bal" type="monotone" dataKey="balance" name="Balance"
                    stroke="#00ff87" strokeWidth={2.5} fill="url(#gbGrad)" dot={false}
                    activeDot={{ r: 4, fill: "#00ff87" }} />
                  <Bar yAxisId="wd" dataKey="withdrawal" name="Withdrawal"
                    fill="#ffbe0b" fillOpacity={0.55} radius={[2, 2, 0, 0]} maxBarSize={16} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Year-by-year table */}
          <div className="section">
            <h2 className="section-title">YEAR-BY-YEAR DETAIL</h2>
            <div style={{ overflowX: "auto", WebkitOverflowScrolling: "touch" }}>
              <table className="gb-table">
                <thead>
                  <tr>
                    <th>Year</th>
                    <th>Return</th>
                    <th>Opening Balance</th>
                    <th>Gain vs Cost</th>
                    <th>Rate</th>
                    <th>Annual Withdrawal (USD)</th>
                    {exchangeRate && <th>Monthly GHS</th>}
                    <th>Closing Balance</th>
                  </tr>
                </thead>
                <tbody>
                  {simData.map((d) => {
                    const retColor = d.annualReturn < 0 ? "#ff6b6b" : d.annualReturn > 20 ? "#00ff87" : "#aaa";
                    const balColor =
                      d.portfolioAfter > portfolio ? "#00ff87"
                        : d.portfolioAfter > portfolio * 0.5 ? "#00d4ff"
                          : d.portfolioAfter > portfolio * 0.25 ? "#ffbe0b"
                            : "#ff6b6b";
                    const gainColor = d.gainPct >= 75 ? "#00ff87" : d.gainPct >= 50 ? "#00d4ff" : d.gainPct >= 25 ? "#ffbe0b" : d.gainPct >= 0 ? "#ff6b6b" : "#8338ec";
                    const monthlyGHS = exchangeRate && d.year > 0 ? (d.withdrawal / 12) * exchangeRate : null;
                    return (
                      <tr key={d.year}>
                        <td style={{ color: "#888" }}>{d.year === 0 ? "Start" : d.calendarYear}</td>
                        <td style={{ color: retColor, fontWeight: 500 }}>
                          {d.year === 0 ? "—" : `${d.annualReturn >= 0 ? "+" : ""}${d.annualReturn.toFixed(1)}%`}
                        </td>
                        <td style={{ color: "#aaa" }}>{fmt(d.portfolioBefore)}</td>
                        <td style={{ color: gainColor, fontWeight: 500 }}>
                          {d.gainPct >= 0 ? "+" : ""}{d.gainPct.toFixed(1)}%
                        </td>
                        <td style={{ color: RATE_COLORS[d.withdrawalRate], fontWeight: 600 }}>
                          {d.year === 0 ? "—" : `${d.withdrawalRate}%`}
                        </td>
                        <td style={{ color: "#ffbe0b", fontWeight: 500 }}>
                          {d.year === 0 ? "—" : fmt(d.withdrawal)}
                        </td>
                        {exchangeRate && (
                          <td style={{ color: "#00ff87", fontSize: 12 }}>
                            {monthlyGHS !== null ? `₵${Math.round(monthlyGHS).toLocaleString()}/mo` : "—"}
                          </td>
                        )}
                        <td style={{ color: balColor, fontWeight: 500 }}>{fmt(d.portfolioAfter)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Footer */}
          <div className="section" style={{ background: "#0a0a14", border: "1px solid #1a1a28", borderRadius: 12, padding: "16px 20px" }}>
            <div style={{ display: "flex", gap: 24, flexWrap: "wrap", fontSize: 12 }}>
              <div>
                <span style={{ color: "#555", letterSpacing: 1 }}>DATA SOURCE</span>
                <span style={{ color: "#aaa", marginLeft: 10 }}>S&P 500 Total Return {MIN_YEAR}–{MAX_YEAR}</span>
              </div>
              <div>
                <span style={{ color: "#555", letterSpacing: 1 }}>WITHDRAWAL RULE</span>
                <span style={{ color: "#00ff87", marginLeft: 10 }}>Gain-based tiered rate · 4–8% of opening balance</span>
              </div>
              <div>
                <span style={{ color: "#555", letterSpacing: 1 }}>COST BASIS</span>
                <span style={{ color: "#aaa", marginLeft: 10 }}>{fmt(costBasis)} (fixed)</span>
              </div>
              <div>
                <span style={{ color: "#555", letterSpacing: 1 }}>SEQUENCE TESTED</span>
                <span style={{ color: "#aaa", marginLeft: 10 }}>{startYear} → {endYear}</span>
              </div>
            </div>
          </div>
        </>
      )}

      {!calculated && (
        <div className="section" style={{ textAlign: "center", padding: "40px 22px", color: "#444" }}>
          <div style={{ fontSize: 36, marginBottom: 12 }}>📊</div>
          <div style={{ fontSize: 14, letterSpacing: 1 }}>
            Enter your portfolio value, cost basis, and press CALCULATE to run the simulation
          </div>
        </div>
      )}
    </div>
  );
}
