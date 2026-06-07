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

// S&P 500 historical annual total returns 1985–2026
const HISTORICAL_RETURNS: Record<number, number> = {
  1985: 31.6,  1986: 18.6,  1987: 5.1,   1988: 16.6,  1989: 31.7,
  1990: -3.1,  1991: 30.5,  1992: 7.6,   1993: 10.1,  1994: 1.3,
  1995: 37.6,  1996: 23.0,  1997: 33.4,  1998: 28.6,  1999: 21.0,
  2000: -9.1,  2001: -11.9, 2002: -22.1, 2003: 28.7,  2004: 10.9,
  2005: 4.9,   2006: 15.8,  2007: 5.5,   2008: -37.0, 2009: 26.5,
  2010: 15.1,  2011: 2.1,   2012: 16.0,  2013: 32.4,  2014: 13.7,
  2015: 1.4,   2016: 12.0,  2017: 21.8,  2018: -4.4,  2019: 31.5,
  2020: 18.4,  2021: 28.7,  2022: -18.1, 2023: 26.3,  2024: 25.0,
  2025: 23.0,  2026: 10.0,
};

const DATA_YEARS = Object.keys(HISTORICAL_RETURNS).map(Number).sort((a, b) => a - b);
const MIN_YEAR = DATA_YEARS[0];
const MAX_YEAR = DATA_YEARS[DATA_YEARS.length - 1];
const SPAN = MAX_YEAR - MIN_YEAR + 1;

function getHistoricalReturn(calendarYear: number): number {
  if (HISTORICAL_RETURNS[calendarYear] !== undefined) return HISTORICAL_RETURNS[calendarYear];
  const offset = ((calendarYear - MIN_YEAR) % SPAN + SPAN) % SPAN;
  return HISTORICAL_RETURNS[MIN_YEAR + offset];
}

const fmt = (n: number) =>
  n >= 1_000_000
    ? `$${(n / 1_000_000).toFixed(2)}M`
    : n >= 1000
      ? `$${(n / 1000).toFixed(0)}K`
      : `$${Math.round(n)}`;

const fmtGHS = (n: number, er: number | null) => {
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
  portfolio: number;
  withdrawal: number;
  annualReturn: number;
  currentRate: number;
  depleted: boolean;
  adjustment: string | null;
  cycled: boolean;
};

function simulate(
  initialPortfolio: number,
  withdrawalRate: number,
  retirementYears: number,
  startYear: number,
): SimYear[] {
  const result: SimYear[] = [];
  let portfolio = initialPortfolio;
  let withdrawal = initialPortfolio * (withdrawalRate / 100);
  const upperGuardrail = withdrawalRate * 1.25;
  const lowerGuardrail = withdrawalRate * 0.75;

  result.push({
    year: 0,
    calendarYear: startYear,
    portfolio,
    withdrawal: 0,
    annualReturn: 0,
    currentRate: withdrawalRate,
    depleted: false,
    adjustment: null,
    cycled: false,
  });

  for (let y = 1; y <= retirementYears; y++) {
    const calendarYear = startYear + y - 1;
    const cycled = calendarYear > MAX_YEAR;
    const annualReturn = getHistoricalReturn(calendarYear);

    // 1. Apply market return
    portfolio = portfolio * (1 + annualReturn / 100);

    // 2. Compute implied rate with current withdrawal
    const impliedRate = portfolio > 0 ? (withdrawal / portfolio) * 100 : 999;

    // 3. Guardrail adjustments
    let adjustment: string | null = null;
    if (impliedRate > upperGuardrail) {
      withdrawal *= 0.90;
      adjustment = "−10% cut";
    } else if (impliedRate < lowerGuardrail) {
      withdrawal *= 1.10;
      adjustment = "+10% raise";
    } else {
      withdrawal *= 1.025; // 2.5% inflation raise
    }

    const currentRate = portfolio > 0 ? (withdrawal / portfolio) * 100 : 0;

    // 4. Check depletion
    if (portfolio <= withdrawal || portfolio <= 0) {
      result.push({
        year: y,
        calendarYear,
        portfolio: 0,
        withdrawal: Math.max(0, portfolio),
        annualReturn,
        currentRate: 0,
        depleted: true,
        adjustment: "DEPLETED",
        cycled,
      });
      break;
    }

    portfolio -= withdrawal;

    result.push({
      year: y,
      calendarYear,
      portfolio: Math.round(portfolio),
      withdrawal: Math.round(withdrawal),
      annualReturn,
      currentRate,
      depleted: false,
      adjustment,
      cycled,
    });
  }
  return result;
}

type DWTooltipPayload = { name?: string; value?: number; color?: string };
const DWTooltip = ({
  active,
  payload,
  label,
  exchangeRate,
}: {
  active?: boolean;
  payload?: DWTooltipPayload[];
  label?: number | string;
  exchangeRate: number | null;
}) => {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background: "#0a0a12", border: "1px solid #1a1a28", borderRadius: 8, padding: "10px 14px", fontFamily: "'DM Mono', monospace", fontSize: 12 }}>
      <div style={{ color: "#888", marginBottom: 6, fontSize: 11, letterSpacing: 1 }}>YEAR {label}</div>
      {payload.map((p, i) => {
        const v = Number(p.value ?? 0);
        const ghs = exchangeRate ? fmtGHS(v, exchangeRate) : null;
        return (
          <div key={i} style={{ color: p.color, lineHeight: 1.8 }}>
            {p.name}: {fmt(v)}{ghs ? <span style={{ color: "#888", fontSize: 11 }}> · {ghs}</span> : null}
          </div>
        );
      })}
    </div>
  );
};

export default function DynamicWithdrawal() {
  const [draftPortfolio, setDraftPortfolio] = useState<number | "">(500000);
  const [draftRate, setDraftRate] = useState<number | "">(4);
  const [draftExchangeRate, setDraftExchangeRate] = useState<number | "">(15);
  const [draftYears, setDraftYears] = useState<number | "">(30);
  const [draftStartYear, setDraftStartYear] = useState<number>(2000);
  const lastEdited = useRef<"usd" | "ghs">("usd");
  const [draftPortfolioGHS, setDraftPortfolioGHS] = useState<number | "">("");

  const [portfolio, setPortfolio] = useState(500000);
  const [rate, setRate] = useState(4);
  const [exchangeRate, setExchangeRate] = useState<number | null>(null);
  const [years, setYears] = useState(30);
  const [startYear, setStartYear] = useState(2000);
  const [calculated, setCalculated] = useState(false);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(DW_STORAGE_KEY);
      if (!raw) return;
      const s = JSON.parse(raw) as {
        portfolio?: number; rate?: number; exchangeRate?: number;
        years?: number; startYear?: number; portfolioGHS?: number;
      };
      const p = Math.max(1, Number(s.portfolio) || 500000);
      const r = Math.max(0.1, Number(s.rate) || 4);
      const er = s.exchangeRate && s.exchangeRate > 0 ? s.exchangeRate : null;
      const y = Math.max(1, Math.floor(Number(s.years) || 30));
      const sy = Math.max(MIN_YEAR, Math.min(MAX_YEAR, Math.floor(Number(s.startYear) || 2000)));
      const ghs = s.portfolioGHS && s.portfolioGHS > 0 ? s.portfolioGHS : er ? p * er : "";
      setDraftPortfolio(p); setDraftRate(r); setDraftYears(y); setDraftStartYear(sy);
      if (er) setDraftExchangeRate(er);
      if (ghs) setDraftPortfolioGHS(ghs);
      setPortfolio(p); setRate(r); setExchangeRate(er); setYears(y); setStartYear(sy);
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

  const handleRateChange = (val: string) => {
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
    Number(draftRate) !== rate ||
    (Number(draftExchangeRate) || null) !== exchangeRate ||
    Number(draftYears) !== years ||
    draftStartYear !== startYear;

  const handleCalculate = () => {
    const p = Math.max(1, Math.floor(Number(draftPortfolio) || 1));
    const r = Math.max(0.1, Number(draftRate) || 4);
    const er = typeof draftExchangeRate === "number" && draftExchangeRate > 0 ? draftExchangeRate : null;
    const y = Math.max(1, Math.floor(Number(draftYears) || 1));
    const sy = draftStartYear;
    const ghsVal = typeof draftPortfolioGHS === "number" && draftPortfolioGHS > 0
      ? draftPortfolioGHS : er ? p * er : null;
    setDraftPortfolio(p); setDraftRate(r); setDraftYears(y);
    if (er) setDraftExchangeRate(er);
    if (ghsVal) setDraftPortfolioGHS(ghsVal);
    setPortfolio(p); setRate(r); setExchangeRate(er); setYears(y); setStartYear(sy);
    setCalculated(true);
    try {
      window.localStorage.setItem(DW_STORAGE_KEY, JSON.stringify({
        portfolio: p, rate: r, exchangeRate: er, years: y, startYear: sy, portfolioGHS: ghsVal,
      }));
    } catch { /* ignore */ }
  };

  const simData = useMemo(
    () => simulate(portfolio, rate, years, startYear),
    [portfolio, rate, years, startYear],
  );

  const survived = !simData[simData.length - 1].depleted;
  const finalBalance = simData[simData.length - 1].portfolio;
  const totalWithdrawn = simData.slice(1).reduce((s, d) => s + d.withdrawal, 0);
  const avgWithdrawal = simData.length > 1
    ? totalWithdrawn / (simData.length - 1) : 0;
  const minWithdrawal = Math.min(...simData.slice(1).map((d) => d.withdrawal).filter((v) => v > 0));
  const maxWithdrawal = Math.max(...simData.slice(1).map((d) => d.withdrawal));
  const cycledYears = simData.filter((d) => d.cycled).length;
  const depletedAt = survived ? null : simData[simData.length - 1].year;

  const chartData = simData.map((d) => ({
    year: d.year,
    calendarYear: d.calendarYear,
    balance: d.portfolio,
    withdrawal: d.withdrawal,
    return: d.annualReturn,
    cycled: d.cycled,
  }));

  return (
    <div style={{ maxWidth: 1200, margin: "0 auto" }}>
      {/* Inputs */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))", gap: 16 }}>
        <div className="stat-card slider-wrap">
          <div className="slider-label">
            <span>Portfolio Value (USD)</span>
            <span className="slider-val">{fmt(Number(draftPortfolio) || 0)}</span>
          </div>
          <input className="num-input" type="number" min={1} step={10000}
            value={draftPortfolio} onChange={(e) => handleUSDChange(e.target.value)} />
        </div>

        <div className="stat-card slider-wrap">
          <div className="slider-label">
            <span>Portfolio Value (GHS)</span>
            <span className="slider-val">
              {typeof draftPortfolioGHS === "number" && draftPortfolioGHS > 0
                ? `₵${Math.round(draftPortfolioGHS).toLocaleString()}`
                : typeof draftPortfolio === "number" && typeof draftExchangeRate === "number" && draftExchangeRate > 0
                  ? `₵${Math.round(draftPortfolio * draftExchangeRate).toLocaleString()}`
                  : "—"}
            </span>
          </div>
          <input className="num-input" type="number" min={1} step={10000}
            placeholder="e.g. 7500000"
            value={typeof draftPortfolioGHS === "number" && draftPortfolioGHS > 0
              ? parseFloat(draftPortfolioGHS.toFixed(2)) : ""}
            onChange={(e) => handleGHSChange(e.target.value)} />
        </div>

        <div className="stat-card slider-wrap">
          <div className="slider-label">
            <span>USD → GHS Rate</span>
            <span className="slider-val">
              {typeof draftExchangeRate === "number" ? `×${draftExchangeRate}` : "—"}
            </span>
          </div>
          <input className="num-input" type="number" min={0} step={0.1}
            placeholder="15" value={typeof draftExchangeRate === "number" ? draftExchangeRate : ""}
            onChange={(e) => handleRateChange(e.target.value)} />
        </div>

        <div className="stat-card slider-wrap">
          <div className="slider-label">
            <span>Withdrawal Rate (%)</span>
            <span className="slider-val">{Number(draftRate) || 0}%</span>
          </div>
          <input className="num-input" type="number" min={0.1} max={20} step={0.1}
            value={draftRate} onChange={(e) => setDraftRate(e.target.value === "" ? "" : +e.target.value)} />
        </div>

        <div className="stat-card slider-wrap">
          <div className="slider-label">
            <span>Retirement Years</span>
            <span className="slider-val">{Number(draftYears) || 0} yrs</span>
          </div>
          <input className="num-input" type="number" min={1} max={60} step={1}
            value={draftYears} onChange={(e) => setDraftYears(e.target.value === "" ? "" : +e.target.value)} />
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
              padding: "8px 10px", borderRadius: 6, outline: "none",
            }}
            value={draftStartYear}
            onChange={(e) => setDraftStartYear(Number(e.target.value))}
          >
            {DATA_YEARS.map((y) => (
              <option key={y} value={y} style={{ background: "#07070d" }}>
                {y} ({HISTORICAL_RETURNS[y] > 0 ? "+" : ""}{HISTORICAL_RETURNS[y].toFixed(1)}%)
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="calc-bar">
        <span className="calc-hint">{isDirty ? "Unapplied changes — press Calculate" : ""}</span>
        <button className="calc-btn" type="button" onClick={handleCalculate}
          disabled={!isDirty && calculated}>
          CALCULATE
        </button>
      </div>

      {/* Strategy legend */}
      <div style={{ background: "#0a0a14", border: "1px solid #15151f", borderRadius: 10, padding: "12px 18px", marginTop: 12, fontSize: 12, color: "#555", lineHeight: 1.8 }}>
        <span style={{ color: "#888", letterSpacing: 1 }}>GUARDRAILS STRATEGY · </span>
        Withdrawal adjusts +10% when rate falls below <span style={{ color: "#00ff87" }}>×0.75</span> of initial ·
        {" "}cut −10% when above <span style={{ color: "#ff6b6b" }}>×1.25</span> of initial ·
        {" "}+2.5% inflation raise otherwise · uses real S&P 500 returns {MIN_YEAR}–{MAX_YEAR}
      </div>

      {calculated && (
        <>
          {/* Summary Cards */}
          <div className="section">
            <h2 className="section-title">SIMULATION RESULTS · START {startYear} · {years} YEARS</h2>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: 12, marginBottom: 4 }}>
              {/* Survival */}
              <div style={{ background: "#0e0e18", border: `1px solid ${survived ? "#00ff8733" : "#ff6b6b33"}`, borderRadius: 12, padding: "18px 20px" }}>
                <div style={{ fontSize: 11, color: "#666", letterSpacing: 1.5, marginBottom: 6 }}>SURVIVAL</div>
                <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 32, color: survived ? "#00ff87" : "#ff6b6b", lineHeight: 1 }}>
                  {survived ? "SURVIVED" : "DEPLETED"}
                </div>
                <div style={{ fontSize: 11, color: "#555", marginTop: 6 }}>
                  {survived
                    ? `Full ${years}-year horizon`
                    : `Portfolio ran out at year ${depletedAt}`}
                </div>
              </div>

              {/* Final balance */}
              <div style={{ background: "#0e0e18", border: "1px solid #00d4ff33", borderRadius: 12, padding: "18px 20px" }}>
                <div style={{ fontSize: 11, color: "#666", letterSpacing: 1.5, marginBottom: 6 }}>FINAL BALANCE</div>
                <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 28, color: "#00d4ff", lineHeight: 1 }}>
                  {fmt(finalBalance)}
                </div>
                {exchangeRate && <div style={{ fontSize: 12, color: "#888", marginTop: 4, letterSpacing: 0.5 }}>{fmtGHS(finalBalance, exchangeRate)}</div>}
                <div style={{ fontSize: 11, color: "#555", marginTop: 6 }}>After {years} years</div>
              </div>

              {/* Avg annual withdrawal */}
              <div style={{ background: "#0e0e18", border: "1px solid #ffbe0b33", borderRadius: 12, padding: "18px 20px" }}>
                <div style={{ fontSize: 11, color: "#666", letterSpacing: 1.5, marginBottom: 6 }}>AVG ANNUAL WITHDRAWAL</div>
                <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 28, color: "#ffbe0b", lineHeight: 1 }}>
                  {fmt(avgWithdrawal)}
                </div>
                {exchangeRate && <div style={{ fontSize: 12, color: "#888", marginTop: 4, letterSpacing: 0.5 }}>{fmtGHS(avgWithdrawal, exchangeRate)}/yr</div>}
                <div style={{ fontSize: 11, color: "#555", marginTop: 6 }}>Range: {fmt(minWithdrawal)} – {fmt(maxWithdrawal)}</div>
              </div>

              {/* Total withdrawn */}
              <div style={{ background: "#0e0e18", border: "1px solid #8338ec33", borderRadius: 12, padding: "18px 20px" }}>
                <div style={{ fontSize: 11, color: "#666", letterSpacing: 1.5, marginBottom: 6 }}>TOTAL WITHDRAWN</div>
                <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 28, color: "#8338ec", lineHeight: 1 }}>
                  {fmt(totalWithdrawn)}
                </div>
                {exchangeRate && <div style={{ fontSize: 12, color: "#888", marginTop: 4, letterSpacing: 0.5 }}>{fmtGHS(totalWithdrawn, exchangeRate)}</div>}
                <div style={{ fontSize: 11, color: "#555", marginTop: 6 }}>Across {simData.length - 1} years</div>
              </div>

              {/* Initial withdrawal */}
              <div style={{ background: "#0e0e18", border: "1px solid #ff6b6b33", borderRadius: 12, padding: "18px 20px" }}>
                <div style={{ fontSize: 11, color: "#666", letterSpacing: 1.5, marginBottom: 6 }}>INITIAL ANNUAL WITHDRAWAL</div>
                <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 28, color: "#ff6b6b", lineHeight: 1 }}>
                  {fmt(portfolio * (rate / 100))}
                </div>
                {exchangeRate && <div style={{ fontSize: 12, color: "#888", marginTop: 4, letterSpacing: 0.5 }}>{fmtGHS(portfolio * (rate / 100), exchangeRate)}/yr</div>}
                <div style={{ fontSize: 11, color: "#555", marginTop: 6 }}>{rate}% of {fmt(portfolio)}</div>
              </div>

              {/* Cycled data note */}
              {cycledYears > 0 && (
                <div style={{ background: "#0e0e18", border: "1px solid #33333355", borderRadius: 12, padding: "18px 20px" }}>
                  <div style={{ fontSize: 11, color: "#666", letterSpacing: 1.5, marginBottom: 6 }}>DATA NOTE</div>
                  <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 28, color: "#555", lineHeight: 1 }}>
                    {cycledYears} YRS
                  </div>
                  <div style={{ fontSize: 11, color: "#444", marginTop: 6 }}>
                    Cycled from {MIN_YEAR} after {MAX_YEAR}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Combined Chart */}
          <div className="section">
            <h2 className="section-title">PORTFOLIO BALANCE & ANNUAL WITHDRAWAL</h2>
            <p style={{ color: "#666", fontSize: 12, marginTop: -8, marginBottom: 14 }}>
              Balance (area) · Annual withdrawal (bars) · Negative-return years highlighted
            </p>
            <div style={{ width: "100%", height: 380 }}>
              <ResponsiveContainer>
                <ComposedChart data={chartData} margin={{ top: 10, right: 20, bottom: 0, left: 0 }}>
                  <defs>
                    <linearGradient id="dwBalanceGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#00d4ff" stopOpacity={0.18} />
                      <stop offset="95%" stopColor="#00d4ff" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke="#1a1a28" strokeDasharray="3 3" />
                  <XAxis dataKey="year" stroke="#555" tick={{ fill: "#666", fontSize: 11 }}
                    label={{ value: "Years into retirement", position: "insideBottom", offset: -5, fill: "#555", fontSize: 11 }} />
                  <YAxis yAxisId="balance" stroke="#555" tick={{ fill: "#666", fontSize: 11 }}
                    tickFormatter={(v) => fmt(Number(v))} />
                  <YAxis yAxisId="withdrawal" orientation="right" stroke="#555"
                    tick={{ fill: "#666", fontSize: 11 }} tickFormatter={(v) => fmt(Number(v))} />
                  <Tooltip content={<DWTooltip exchangeRate={exchangeRate} />} />
                  {/* Highlight negative-return years */}
                  {chartData.filter((d) => d.year > 0 && d.return < 0).map((d) => (
                    <ReferenceLine key={`neg-${d.year}`} yAxisId="balance" x={d.year}
                      stroke="#ff6b6b" strokeOpacity={0.15} strokeWidth={28} />
                  ))}
                  <Area yAxisId="balance" type="monotone" dataKey="balance" name="Balance"
                    stroke="#00d4ff" strokeWidth={2.5} fill="url(#dwBalanceGrad)"
                    dot={false} activeDot={{ r: 4, fill: "#00d4ff" }} />
                  <Bar yAxisId="withdrawal" dataKey="withdrawal" name="Withdrawal"
                    fill="#ffbe0b" fillOpacity={0.55} radius={[2, 2, 0, 0]} maxBarSize={18} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Year-by-Year Table */}
          <div className="section">
            <h2 className="section-title">YEAR-BY-YEAR DETAIL</h2>
            <div style={{ overflowX: "auto" }}>
              <table>
                <thead>
                  <tr>
                    {["Year", "Calendar", "Return", "Portfolio Balance", "Annual Withdrawal",
                      ...(exchangeRate ? ["GHS Withdrawal"] : []),
                      "Eff. Rate", "Adjustment"].map((h) => (
                      <th key={h}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {simData.map((d, i) => {
                    const depleting = d.portfolio < portfolio * 0.25 && d.portfolio > 0;
                    const balColor = d.depleted
                      ? "#ff6b6b"
                      : depleting
                        ? "#ff6b6b"
                        : d.portfolio < portfolio * 0.5
                          ? "#ffbe0b"
                          : "#00d4ff";
                    const retColor = d.annualReturn < 0 ? "#ff6b6b" : d.annualReturn > 20 ? "#00ff87" : "#aaa";
                    return (
                      <tr key={i} style={{ opacity: d.depleted ? 0.7 : 1 }}>
                        <td style={{ color: "#888" }}>{d.year === 0 ? "Start" : `Year ${d.year}`}</td>
                        <td style={{ color: "#666", fontSize: 12 }}>
                          {d.calendarYear}
                          {d.cycled && <span style={{ color: "#444", fontSize: 10 }}> ↩</span>}
                        </td>
                        <td style={{ color: retColor, fontWeight: 500 }}>
                          {d.year === 0 ? "—" : `${d.annualReturn >= 0 ? "+" : ""}${d.annualReturn.toFixed(1)}%`}
                        </td>
                        <td style={{ color: balColor, fontWeight: 500 }}>
                          {d.depleted ? "DEPLETED" : fmt(d.portfolio)}
                        </td>
                        <td style={{ color: "#ffbe0b" }}>
                          {d.year === 0 ? "—" : fmt(d.withdrawal)}
                        </td>
                        {exchangeRate && (
                          <td style={{ color: "#888", fontSize: 12 }}>
                            {d.year === 0 ? "—" : fmtGHS(d.withdrawal, exchangeRate)}
                          </td>
                        )}
                        <td style={{ color: "#666", fontSize: 12 }}>
                          {d.year === 0 ? `${rate.toFixed(1)}%` : `${d.currentRate.toFixed(1)}%`}
                        </td>
                        <td style={{
                          fontSize: 11,
                          color: d.adjustment === "DEPLETED" ? "#ff6b6b"
                            : d.adjustment === "−10% cut" ? "#ff6b6b"
                              : d.adjustment === "+10% raise" ? "#00ff87"
                                : "#444",
                        }}>
                          {d.adjustment ?? (d.year === 0 ? "—" : "+2.5% inflation")}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Footer meta */}
          <div className="section" style={{ background: "#0a0a14", border: "1px solid #1a1a28", borderRadius: 12, padding: "16px 20px" }}>
            <div style={{ display: "flex", gap: 24, flexWrap: "wrap", fontSize: 12 }}>
              <div>
                <span style={{ color: "#555", letterSpacing: 1 }}>DATA SOURCE</span>
                <span style={{ color: "#aaa", marginLeft: 10 }}>S&P 500 Total Return {MIN_YEAR}–{MAX_YEAR}</span>
              </div>
              <div>
                <span style={{ color: "#555", letterSpacing: 1 }}>UPPER GUARDRAIL</span>
                <span style={{ color: "#ff6b6b", marginLeft: 10 }}>{(rate * 1.25).toFixed(2)}%</span>
              </div>
              <div>
                <span style={{ color: "#555", letterSpacing: 1 }}>LOWER GUARDRAIL</span>
                <span style={{ color: "#00ff87", marginLeft: 10 }}>{(rate * 0.75).toFixed(2)}%</span>
              </div>
              <div>
                <span style={{ color: "#555", letterSpacing: 1 }}>INFLATION RAISE</span>
                <span style={{ color: "#aaa", marginLeft: 10 }}>2.5% / yr</span>
              </div>
              {cycledYears > 0 && (
                <div>
                  <span style={{ color: "#555", letterSpacing: 1 }}>↩ CYCLED</span>
                  <span style={{ color: "#555", marginLeft: 10 }}>Years beyond {MAX_YEAR} replay from {MIN_YEAR}</span>
                </div>
              )}
            </div>
          </div>
        </>
      )}

      {!calculated && (
        <div className="section" style={{ textAlign: "center", padding: "40px 22px", color: "#444" }}>
          <div style={{ fontSize: 36, marginBottom: 12 }}>📈</div>
          <div style={{ fontSize: 14, letterSpacing: 1 }}>
            Set your inputs above and press CALCULATE to run the historical simulation
          </div>
        </div>
      )}
    </div>
  );
}
