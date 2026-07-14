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

type FixedSimYear = {
  year: number;
  calendarYear: number;
  portfolioAfter: number;
  withdrawal: number;
};

function simulateFixed(
  costBasis: number,
  fixedRate: number,
  startYear: number,
  endYear: number,
): FixedSimYear[] {
  let portfolio = costBasis;
  const result: FixedSimYear[] = [
    { year: 0, calendarYear: startYear, portfolioAfter: portfolio, withdrawal: 0 },
  ];
  const totalYears = endYear - startYear + 1;
  for (let y = 1; y <= totalYears; y++) {
    const calendarYear = startYear + y - 1;
    const annualReturn = getHistoricalReturn(calendarYear);
    const withdrawal = portfolio * (fixedRate / 100);
    const afterWithdrawal = portfolio - withdrawal;
    portfolio = afterWithdrawal * (1 + annualReturn / 100);
    result.push({
      year: y,
      calendarYear,
      portfolioAfter: Math.round(portfolio),
      withdrawal: Math.round(withdrawal),
    });
  }
  return result;
}

function simulate(
  costBasis: number,
  startYear: number,
  endYear: number,
): GBSimYear[] {
  let portfolio = costBasis;
  const result: GBSimYear[] = [];

  result.push({
    year: 0,
    calendarYear: startYear,
    portfolioBefore: portfolio,
    gainPct: 0,
    withdrawalRate: getWithdrawalRate(0),
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
  const [draftCostBasis, setDraftCostBasis] = useState<number | "">(300000);
  const [draftCostBasisGHS, setDraftCostBasisGHS] = useState<number | "">("");
  const [draftExchangeRate, setDraftExchangeRate] = useState<number | "">(15);
  const [draftStartYear, setDraftStartYear] = useState<number>(2000);
  const [draftDuration, setDraftDuration] = useState<number | "">(30);
  const lastCostEdited = useRef<"usd" | "ghs">("usd");

  const [costBasis, setCostBasis] = useState(300000);
  const [exchangeRate, setExchangeRate] = useState<number | null>(null);
  const [startYear, setStartYear] = useState(2000);
  const [duration, setDuration] = useState<number | null>(30);
  const [calculated, setCalculated] = useState(false);
  const [fixedRate, setFixedRate] = useState(6);

  const endYear = duration === null ? MAX_YEAR : Math.min(startYear + duration - 1, MAX_YEAR);
  const years = endYear - startYear + 1;
  const draftEndYear =
    draftDuration === ""
      ? MAX_YEAR
      : Math.min(draftStartYear + (draftDuration as number) - 1, MAX_YEAR);
  const isCapped =
    draftDuration !== "" &&
    draftStartYear + (draftDuration as number) - 1 > MAX_YEAR;

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(GB_STORAGE_KEY);
      if (!raw) return;
      const s = JSON.parse(raw) as {
        costBasis?: number;
        costBasisGHS?: number;
        exchangeRate?: number;
        startYear?: number;
        duration?: number;
      };
      const cb = Math.max(1, Number(s.costBasis) || 300000);
      const er = s.exchangeRate && s.exchangeRate > 0 ? s.exchangeRate : null;
      const sy = Math.max(MIN_YEAR, Math.min(MAX_YEAR, Math.floor(Number(s.startYear) || 2000)));
      const dur = s.duration != null ? Math.max(1, Math.floor(Number(s.duration))) : null;
      const cbGHS = s.costBasisGHS && s.costBasisGHS > 0 ? s.costBasisGHS : er ? cb * er : "";
      setDraftCostBasis(cb);
      setDraftCostBasisGHS(cbGHS);
      setDraftStartYear(sy);
      setDraftDuration(dur ?? "");
      if (er) setDraftExchangeRate(er);
      setCostBasis(cb);
      setExchangeRate(er);
      setStartYear(sy);
      setDuration(dur);
      setCalculated(true);
    } catch { }
  }, []);

  const handleCostUSDChange = (val: string) => {
    const n = val === "" ? "" : +val;
    setDraftCostBasis(n);
    lastCostEdited.current = "usd";
    const er = typeof draftExchangeRate === "number" && draftExchangeRate > 0 ? draftExchangeRate : null;
    setDraftCostBasisGHS(typeof n === "number" && er ? n * er : "");
  };

  const handleCostGHSChange = (val: string) => {
    const n = val === "" ? "" : +val;
    setDraftCostBasisGHS(n);
    lastCostEdited.current = "ghs";
    const er = typeof draftExchangeRate === "number" && draftExchangeRate > 0 ? draftExchangeRate : null;
    setDraftCostBasis(typeof n === "number" && er ? n / er : "");
  };

  const handleExchangeRateChange = (val: string) => {
    const er = val === "" ? "" : +val;
    setDraftExchangeRate(er);
    const erNum = typeof er === "number" && er > 0 ? er : null;
    if (lastCostEdited.current === "usd" && typeof draftCostBasis === "number" && erNum) {
      setDraftCostBasisGHS(draftCostBasis * erNum);
    } else if (lastCostEdited.current === "ghs" && typeof draftCostBasisGHS === "number" && erNum) {
      setDraftCostBasis(draftCostBasisGHS / erNum);
    }
  };

  const draftDurationVal = draftDuration === "" ? null : draftDuration;
  const isDirty =
    Number(draftCostBasis) !== costBasis ||
    (Number(draftExchangeRate) || null) !== exchangeRate ||
    draftStartYear !== startYear ||
    draftDurationVal !== duration;

  const handleCalculate = () => {
    const cb = Math.max(1, Math.floor(Number(draftCostBasis) || 1));
    const er = typeof draftExchangeRate === "number" && draftExchangeRate > 0 ? draftExchangeRate : null;
    const sy = draftStartYear;
    const dur = draftDuration === "" ? null : Math.max(1, Math.floor(Number(draftDuration)));
    const cbGHS =
      typeof draftCostBasisGHS === "number" && draftCostBasisGHS > 0
        ? draftCostBasisGHS
        : er ? cb * er : null;
    setDraftCostBasis(cb);
    if (cbGHS) setDraftCostBasisGHS(cbGHS);
    setDraftDuration(dur ?? "");
    setCostBasis(cb);
    setExchangeRate(er);
    setStartYear(sy);
    setDuration(dur);
    setCalculated(true);
    try {
      window.localStorage.setItem(
        GB_STORAGE_KEY,
        JSON.stringify({ costBasis: cb, costBasisGHS: cbGHS, exchangeRate: er, startYear: sy, duration: dur ?? null }),
      );
    } catch { }
  };

  const simData = useMemo(
    () => simulate(costBasis, startYear, endYear),
    [costBasis, startYear, endYear],
  );

  const fixedSimData = useMemo(
    () => simulateFixed(costBasis, fixedRate, startYear, endYear),
    [costBasis, fixedRate, startYear, endYear],
  );

  const lastRow = simData[simData.length - 1];
  const finalBalance = lastRow.portfolioAfter;
  const grew = finalBalance > costBasis;
  const withdrawalRows = simData.slice(1);
  const totalWithdrawn = withdrawalRows.reduce((s, d) => s + d.withdrawal, 0);
  const avgWithdrawal = withdrawalRows.length > 0 ? totalWithdrawn / withdrawalRows.length : 0;
  const avgMonthlyWithdrawal = avgWithdrawal / 12;

  const fixedLastRow = fixedSimData[fixedSimData.length - 1];
  const fixedFinalBalance = fixedLastRow.portfolioAfter;
  const fixedTotalWithdrawn = fixedSimData.slice(1).reduce((s, d) => s + d.withdrawal, 0);
  const fixedAvgMonthlyWithdrawal =
    fixedSimData.slice(1).reduce((s, d) => s + d.withdrawal, 0) / Math.max(1, years) / 12;

  const cagr =
    years > 0 && costBasis > 0
      ? (Math.pow(finalBalance / costBasis, 1 / years) - 1) * 100
      : 0;
  const fixedCagr =
    years > 0 && costBasis > 0
      ? (Math.pow(fixedFinalBalance / costBasis, 1 / years) - 1) * 100
      : 0;

  const retainedPct = (finalBalance / costBasis) * 100;
  const survivalStatus: "strong" | "survived" | "atrisk" | "depleted" =
    finalBalance >= costBasis
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
      ? `Portfolio grew ${retainedPct.toFixed(0)}% of cost basis`
      : `${retainedPct.toFixed(1)}% of cost basis remains`;

  const chartData = simData.map((d, i) => ({
    calendarYear: d.calendarYear,
    balance: d.portfolioAfter,
    fixedBalance: fixedSimData[i]?.portfolioAfter ?? 0,
    withdrawal: d.withdrawal,
    return: d.annualReturn,
  }));

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
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))",
          gap: 16,
        }}
      >
        {/* Cost Basis USD */}
        <div className="stat-card slider-wrap">
          <div className="slider-label">
            <span>Total Invested / Cost Basis (USD)</span>
            <span className="slider-val">{fmt(Number(draftCostBasis) || 0)}</span>
          </div>
          <input
            className="num-input"
            type="number"
            min={1}
            step={10000}
            placeholder="e.g. 300000"
            value={draftCostBasis}
            onChange={(e) => handleCostUSDChange(e.target.value)}
          />
        </div>

        {/* Cost Basis GHS */}
        <div className="stat-card slider-wrap">
          <div className="slider-label">
            <span>Total Invested / Cost Basis (GHS)</span>
            <span className="slider-val">
              {typeof draftCostBasisGHS === "number" && draftCostBasisGHS > 0
                ? (fmtGHS(draftCostBasisGHS, 1) ?? "—")
                : typeof draftCostBasis === "number" && typeof draftExchangeRate === "number" && draftExchangeRate > 0
                  ? (fmtGHS(draftCostBasis * draftExchangeRate, 1) ?? "—")
                  : "—"}
            </span>
          </div>
          <input
            className="num-input"
            type="number"
            min={1}
            step={100000}
            placeholder="e.g. 4500000"
            value={
              typeof draftCostBasisGHS === "number" && draftCostBasisGHS > 0
                ? parseFloat(draftCostBasisGHS.toFixed(2))
                : ""
            }
            onChange={(e) => handleCostGHSChange(e.target.value)}
          />
        </div>

        {/* Exchange Rate */}
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
            placeholder="optional"
            value={typeof draftExchangeRate === "number" ? draftExchangeRate : ""}
            onChange={(e) => handleExchangeRateChange(e.target.value)}
          />
          <div style={{ fontSize: 11, color: "#555", letterSpacing: 1, marginTop: 4 }}>
            OPTIONAL · ENABLES GHS COLUMNS
          </div>
        </div>

        {/* Start Year */}
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

        {/* Duration */}
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
        <span className="calc-hint">
          {isDirty ? "Unapplied changes — press Calculate" : ""}
        </span>
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
          padding: "14px 18px",
          marginTop: 12,
          fontSize: 12,
          color: "#555",
          lineHeight: 1.8,
        }}
      >
        <span style={{ color: "#888", letterSpacing: 1 }}>STRATEGY · </span>
        Simulation starts at cost basis. Each year the withdrawal rate adjusts based on how much
        the portfolio has grown above the original investment. Withdrawal taken at start of year,
        then the S&P 500 return applies to the remainder.
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10 }}>
          {[
            { label: "≥ +75%", rate: 8, color: RATE_COLORS[8] },
            { label: "+50–74%", rate: 7, color: RATE_COLORS[7] },
            { label: "+25–49%", rate: 6, color: RATE_COLORS[6] },
            { label: "0–24%", rate: 5, color: RATE_COLORS[5] },
            { label: "< 0%", rate: 4, color: RATE_COLORS[4] },
          ].map(({ label, rate, color }) => (
            <div
              key={rate}
              style={{
                background: "#0e0e18",
                border: `1px solid ${color}44`,
                borderRadius: 6,
                padding: "4px 10px",
                display: "flex",
                gap: 8,
                alignItems: "center",
              }}
            >
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
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))",
                gap: 12,
              }}
            >
              {/* Survival */}
              <div
                style={{
                  background: "#0e0e18",
                  border: `2px solid ${survivalColor}44`,
                  borderRadius: 12,
                  padding: "18px 20px",
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

              {/* Final balance */}
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
                    ? `▲ ${fmt(finalBalance - costBasis)} above cost basis`
                    : `▼ ${fmt(costBasis - finalBalance)} below cost basis`}
                </div>
              </div>

              {/* Portfolio performance */}
              <div
                style={{
                  background: "#0e0e18",
                  border: "1px solid #00ff8733",
                  borderRadius: 12,
                  padding: "18px 20px",
                }}
              >
                {(() => {
                  const perfPct = ((finalBalance - costBasis) / costBasis) * 100;
                  const isPos = perfPct >= 0;
                  return (
                    <>
                      <div
                        style={{
                          fontSize: 11,
                          color: "#666",
                          letterSpacing: 1.5,
                          marginBottom: 6,
                        }}
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
                        {fmt(costBasis)} → {fmt(finalBalance)}
                      </div>
                      {exchangeRate && (
                        <div style={{ fontSize: 11, color: "#888", marginTop: 2 }}>
                          {fmtGHS(costBasis, exchangeRate)} → {fmtGHS(finalBalance, exchangeRate)}
                        </div>
                      )}
                    </>
                  );
                })()}
              </div>

              {/* CAGR */}
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

              {/* Avg monthly */}
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

              {/* Total withdrawn */}
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
                  From {fmt(costBasis)} cost basis
                </div>
              </div>
            </div>
          </div>

          {/* Comparison: rate picker + head-to-head cards */}
          <div className="section">
            <h2 className="section-title">HEAD-TO-HEAD COMPARISON</h2>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16, flexWrap: "wrap" }}>
              <span style={{ fontSize: 11, color: "#666", letterSpacing: 1 }}>COMPARE AGAINST FIXED RATE:</span>
              {[4, 5, 6, 7, 8].map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => setFixedRate(r)}
                  style={{
                    background: fixedRate === r ? "#00d4ff22" : "#0e0e18",
                    border: `1px solid ${fixedRate === r ? "#00d4ff" : "#1a1a28"}`,
                    color: fixedRate === r ? "#00d4ff" : "#555",
                    fontFamily: "'DM Mono', monospace",
                    fontSize: 13,
                    fontWeight: fixedRate === r ? 700 : 400,
                    padding: "5px 14px",
                    borderRadius: 20,
                    cursor: "pointer",
                    transition: "all 0.15s",
                  }}
                >
                  {r}%
                </button>
              ))}
            </div>

            {/* Side-by-side metric rows */}
            {(() => {
              const gbWins = finalBalance > fixedFinalBalance;
              const gbWithdrawMore = totalWithdrawn > fixedTotalWithdrawn;
              return (
                <div style={{ display: "grid", gridTemplateColumns: "1fr auto 1fr", gap: 0, alignItems: "stretch" }}>
                  {/* Header row */}
                  <div style={{ background: "#0e0e18", borderRadius: "10px 0 0 0", padding: "12px 18px", borderBottom: "1px solid #15151f" }}>
                    <div style={{ fontSize: 11, color: "#00ff87", letterSpacing: 1.5, fontWeight: 700 }}>GAIN-BASED (4–8%)</div>
                    <div style={{ fontSize: 10, color: "#555", marginTop: 2 }}>Adapts to portfolio performance</div>
                  </div>
                  <div style={{ background: "#0a0a14", display: "flex", alignItems: "center", justifyContent: "center", padding: "0 12px", borderBottom: "1px solid #15151f", fontSize: 10, color: "#333" }}>VS</div>
                  <div style={{ background: "#0e0e18", borderRadius: "0 10px 0 0", padding: "12px 18px", borderBottom: "1px solid #15151f" }}>
                    <div style={{ fontSize: 11, color: "#00d4ff", letterSpacing: 1.5, fontWeight: 700 }}>FIXED {fixedRate}% ANNUAL</div>
                    <div style={{ fontSize: 10, color: "#555", marginTop: 2 }}>Constant rate every year</div>
                  </div>

                  {/* Final balance */}
                  {[
                    {
                      label: "FINAL BALANCE",
                      gbVal: finalBalance, fxVal: fixedFinalBalance,
                      gbFmt: fmt(finalBalance), fxFmt: fmt(fixedFinalBalance),
                      gbSub: exchangeRate ? fmtGHS(finalBalance, exchangeRate) ?? "" : "",
                      fxSub: exchangeRate ? fmtGHS(fixedFinalBalance, exchangeRate) ?? "" : "",
                      gbBetter: finalBalance >= fixedFinalBalance,
                    },
                    {
                      label: "TOTAL WITHDRAWN",
                      gbVal: totalWithdrawn, fxVal: fixedTotalWithdrawn,
                      gbFmt: fmt(totalWithdrawn), fxFmt: fmt(fixedTotalWithdrawn),
                      gbSub: exchangeRate ? fmtGHS(totalWithdrawn, exchangeRate) ?? "" : "",
                      fxSub: exchangeRate ? fmtGHS(fixedTotalWithdrawn, exchangeRate) ?? "" : "",
                      gbBetter: totalWithdrawn >= fixedTotalWithdrawn,
                    },
                    {
                      label: "AVG MONTHLY INCOME",
                      gbVal: avgMonthlyWithdrawal, fxVal: fixedAvgMonthlyWithdrawal,
                      gbFmt: fmt(avgMonthlyWithdrawal) + "/mo", fxFmt: fmt(fixedAvgMonthlyWithdrawal) + "/mo",
                      gbSub: exchangeRate ? (fmtGHS(avgMonthlyWithdrawal, exchangeRate) ?? "") + "/mo" : "",
                      fxSub: exchangeRate ? (fmtGHS(fixedAvgMonthlyWithdrawal, exchangeRate) ?? "") + "/mo" : "",
                      gbBetter: avgMonthlyWithdrawal >= fixedAvgMonthlyWithdrawal,
                    },
                    {
                      label: "CAGR",
                      gbVal: cagr, fxVal: fixedCagr,
                      gbFmt: `${cagr >= 0 ? "+" : ""}${cagr.toFixed(2)}%`,
                      fxFmt: `${fixedCagr >= 0 ? "+" : ""}${fixedCagr.toFixed(2)}%`,
                      gbSub: "", fxSub: "",
                      gbBetter: cagr >= fixedCagr,
                    },
                  ].map(({ label, gbFmt, fxFmt, gbSub, fxSub, gbBetter }, i) => {
                    const isLast = i === 3;
                    return (
                      <div key={label} style={{ display: "contents" }}>
                        <div style={{ background: "#0e0e18", borderRadius: isLast ? "0 0 0 10px" : 0, padding: "14px 18px", borderBottom: isLast ? "none" : "1px solid #15151f" }}>
                          <div style={{ fontSize: 10, color: "#555", letterSpacing: 1, marginBottom: 4 }}>{label}</div>
                          <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 24, color: gbBetter ? "#00ff87" : "#aaa", lineHeight: 1 }}>
                            {gbFmt}
                            {gbBetter && <span style={{ fontSize: 12, color: "#00ff87", marginLeft: 8 }}>▲</span>}
                          </div>
                          {gbSub && <div style={{ fontSize: 11, color: "#555", marginTop: 3 }}>{gbSub}</div>}
                        </div>
                        <div style={{ background: "#0a0a14", display: "flex", alignItems: "center", justifyContent: "center", borderBottom: isLast ? "none" : "1px solid #15151f" }} />
                        <div style={{ background: "#0e0e18", borderRadius: isLast ? "0 0 10px 0" : 0, padding: "14px 18px", borderBottom: isLast ? "none" : "1px solid #15151f" }}>
                          <div style={{ fontSize: 10, color: "#555", letterSpacing: 1, marginBottom: 4 }}>{label}</div>
                          <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 24, color: !gbBetter ? "#00d4ff" : "#aaa", lineHeight: 1 }}>
                            {fxFmt}
                            {!gbBetter && <span style={{ fontSize: 12, color: "#00d4ff", marginLeft: 8 }}>▲</span>}
                          </div>
                          {fxSub && <div style={{ fontSize: 11, color: "#555", marginTop: 3 }}>{fxSub}</div>}
                        </div>
                      </div>
                    );
                  })}

                  {/* Verdict */}
                  <div style={{ gridColumn: "1 / -1", background: gbWins && gbWithdrawMore ? "#00ff8710" : "#00d4ff10", border: `1px solid ${gbWins && gbWithdrawMore ? "#00ff8733" : "#00d4ff33"}`, borderTop: "none", borderRadius: "0 0 10px 10px", padding: "12px 18px", display: "flex", gap: 16, alignItems: "center", flexWrap: "wrap" }}>
                    <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 18, color: gbWins && gbWithdrawMore ? "#00ff87" : "#00d4ff" }}>
                      {gbWins && gbWithdrawMore
                        ? "GAIN-BASED WINS ON BOTH FRONTS"
                        : !gbWins && !gbWithdrawMore
                          ? `FIXED ${fixedRate}% WINS ON BOTH FRONTS`
                          : gbWins
                            ? `GAIN-BASED PRESERVES MORE · FIXED ${fixedRate}% PAYS OUT MORE`
                            : `FIXED ${fixedRate}% PRESERVES MORE · GAIN-BASED PAYS OUT MORE`}
                    </div>
                    <div style={{ fontSize: 11, color: "#555" }}>
                      Balance diff: <span style={{ color: "#aaa" }}>{fmt(Math.abs(finalBalance - fixedFinalBalance))}</span>
                      {" · "}
                      Withdrawal diff: <span style={{ color: "#aaa" }}>{fmt(Math.abs(totalWithdrawn - fixedTotalWithdrawn))}</span>
                    </div>
                  </div>
                </div>
              );
            })()}
          </div>

          {/* Chart */}
          <div className="section">
            <h2 className="section-title">PORTFOLIO BALANCE OVER TIME</h2>
            <p style={{ color: "#666", fontSize: 12, marginTop: -8, marginBottom: 14 }}>
              <span style={{ color: "#00ff87" }}>——</span> Gain-based balance
              {" · "}
              <span style={{ color: "#00d4ff" }}>- - -</span> Fixed {fixedRate}% balance
              {" · "}
              <span style={{ color: "#ffbe0b" }}>▌</span> Gain-based withdrawal (right axis)
              {" · "}
              Red shade = down years
            </p>
            <div style={{ width: "100%", height: 380 }}>
              <ResponsiveContainer>
                <ComposedChart
                  data={chartData}
                  margin={{ top: 10, right: 20, bottom: 20, left: 0 }}
                >
                  <defs>
                    <linearGradient id="gbGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#00ff87" stopOpacity={0.18} />
                      <stop offset="95%" stopColor="#00ff87" stopOpacity={0} />
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
                  <Tooltip content={<GBTooltip exchangeRate={exchangeRate} />} />
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
                    dataKey="fixedBalance"
                    name={`Fixed ${fixedRate}% Balance`}
                    stroke="#00d4ff"
                    strokeWidth={2}
                    strokeDasharray="6 3"
                    fill="none"
                    dot={false}
                    activeDot={{ r: 3, fill: "#00d4ff" }}
                  />
                  <Area
                    yAxisId="bal"
                    type="monotone"
                    dataKey="balance"
                    name="Gain-Based Balance"
                    stroke="#00ff87"
                    strokeWidth={2.5}
                    fill="url(#gbGrad)"
                    dot={false}
                    activeDot={{ r: 4, fill: "#00ff87" }}
                  />
                  <Bar
                    yAxisId="wd"
                    dataKey="withdrawal"
                    name="Gain-Based Withdrawal"
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
                    const retColor =
                      d.annualReturn < 0
                        ? "#ff6b6b"
                        : d.annualReturn > 20
                          ? "#00ff87"
                          : "#aaa";
                    const balColor =
                      d.portfolioAfter > costBasis
                        ? "#00ff87"
                        : d.portfolioAfter > costBasis * 0.5
                          ? "#00d4ff"
                          : d.portfolioAfter > costBasis * 0.25
                            ? "#ffbe0b"
                            : "#ff6b6b";
                    const gainColor =
                      d.gainPct >= 75
                        ? "#00ff87"
                        : d.gainPct >= 50
                          ? "#00d4ff"
                          : d.gainPct >= 25
                            ? "#ffbe0b"
                            : d.gainPct >= 0
                              ? "#aaa"
                              : "#8338ec";
                    const monthlyGHS =
                      exchangeRate && d.year > 0 ? (d.withdrawal / 12) * exchangeRate : null;
                    return (
                      <tr key={d.year}>
                        <td style={{ color: "#888" }}>
                          {d.year === 0 ? "Start" : d.calendarYear}
                        </td>
                        <td style={{ color: retColor, fontWeight: 500 }}>
                          {d.year === 0
                            ? "—"
                            : `${d.annualReturn >= 0 ? "+" : ""}${d.annualReturn.toFixed(1)}%`}
                        </td>
                        <td style={{ color: "#aaa" }}>{fmt(d.portfolioBefore)}</td>
                        <td style={{ color: gainColor, fontWeight: 500 }}>
                          {d.gainPct >= 0 ? "+" : ""}
                          {d.gainPct.toFixed(1)}%
                        </td>
                        <td style={{ color: RATE_COLORS[d.withdrawalRate], fontWeight: 600 }}>
                          {d.year === 0 ? "—" : `${d.withdrawalRate}%`}
                        </td>
                        <td style={{ color: "#ffbe0b", fontWeight: 500 }}>
                          {d.year === 0 ? "—" : fmt(d.withdrawal)}
                        </td>
                        {exchangeRate && (
                          <td style={{ color: "#00ff87", fontSize: 12 }}>
                            {monthlyGHS !== null
                              ? `₵${Math.round(monthlyGHS).toLocaleString()}/mo`
                              : "—"}
                          </td>
                        )}
                        <td style={{ color: balColor, fontWeight: 500 }}>
                          {fmt(d.portfolioAfter)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Footer */}
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
                  Gain-based tiered rate · 4–8% of opening balance
                </span>
              </div>
              <div>
                <span style={{ color: "#555", letterSpacing: 1 }}>COST BASIS</span>
                <span style={{ color: "#aaa", marginLeft: 10 }}>{fmt(costBasis)}</span>
              </div>
              <div>
                <span style={{ color: "#555", letterSpacing: 1 }}>SEQUENCE TESTED</span>
                <span style={{ color: "#aaa", marginLeft: 10 }}>
                  {startYear} → {endYear}
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
          <div style={{ fontSize: 36, marginBottom: 12 }}>📊</div>
          <div style={{ fontSize: 14, letterSpacing: 1 }}>
            Enter your cost basis and press CALCULATE to run the simulation
          </div>
        </div>
      )}
    </div>
  );
}
