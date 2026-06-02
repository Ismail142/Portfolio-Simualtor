import { useEffect, useMemo, useState } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

const RD_STORAGE_KEY = "retirement-drawdown-inputs";

const fmt = (n: number) =>
  n >= 1_000_000
    ? `$${(n / 1_000_000).toFixed(2)}M`
    : n >= 1000
      ? `$${(n / 1000).toFixed(0)}K`
      : `$${Math.round(n)}`;

const fmtExact = (n: number) =>
  n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

/** Solve for monthly withdrawal W so portfolio reaches $0 at end of n months.
 *  V(t+1) = V(t)*(1+r_m) + contribution - W  →  V(n) = 0
 *  W = contribution + PV * r_m*(1+r_m)^n / ((1+r_m)^n - 1)   [when r_m > 0]
 *  W = contribution + PV / n                                   [when r_m = 0]
 */
function solveWithdrawal(pv: number, annualRate: number, months: number, monthlyContribution: number): number {
  if (months <= 0) return 0;
  const r = annualRate / 100 / 12;
  if (Math.abs(r) < 1e-10) {
    return monthlyContribution + pv / months;
  }
  const factor = Math.pow(1 + r, months);
  return monthlyContribution + (pv * r * factor) / (factor - 1);
}

function simulateDrawdown(
  pv: number,
  annualRate: number,
  months: number,
  monthlyContribution: number,
  monthlyWithdrawal: number,
): { year: number; balance: number; age: number }[] {
  const r = annualRate / 100 / 12;
  const points: { year: number; balance: number; age: number }[] = [];
  let balance = pv;
  const totalYears = Math.ceil(months / 12);

  for (let y = 0; y <= totalYears; y++) {
    points.push({ year: y, balance: Math.max(0, Math.round(balance)), age: 0 });
    if (y < totalYears) {
      const monthsThisYear = Math.min(12, months - y * 12);
      for (let m = 0; m < monthsThisYear; m++) {
        balance = balance * (1 + r) + monthlyContribution - monthlyWithdrawal;
        if (balance < 0) balance = 0;
      }
    }
  }
  return points;
}

type TooltipPayload = { value?: number; color?: string };
const CustomTooltip = ({
  active,
  payload,
  label,
  currentAge,
}: {
  active?: boolean;
  payload?: TooltipPayload[];
  label?: number | string;
  currentAge: number;
}) => {
  if (!active || !payload?.length) return null;
  const age = currentAge + Number(label ?? 0);
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
      <div style={{ color: "#888", marginBottom: 4, fontSize: 11, letterSpacing: 1 }}>
        YEAR {label} · AGE {age}
      </div>
      <div style={{ color: "#00d4ff" }}>Balance: {fmt(Number(payload[0]?.value ?? 0))}</div>
    </div>
  );
};

export default function RetirementDrawdown() {
  const [draftPortfolio, setDraftPortfolio] = useState<number | "">(500000);
  const [draftRate, setDraftRate] = useState<number | "">(6);
  const [draftAge, setDraftAge] = useState<number | "">(65);
  const [draftLifeExpectancy, setDraftLifeExpectancy] = useState<number | "">(90);
  const [draftContribution, setDraftContribution] = useState<number | "">(0);

  const [portfolio, setPortfolio] = useState(500000);
  const [rate, setRate] = useState(6);
  const [age, setAge] = useState(65);
  const [lifeExpectancy, setLifeExpectancy] = useState(90);
  const [contribution, setContribution] = useState(0);
  const [calculated, setCalculated] = useState(false);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(RD_STORAGE_KEY);
      if (!raw) return;
      const s = JSON.parse(raw) as {
        portfolio?: number; rate?: number; age?: number;
        lifeExpectancy?: number; contribution?: number;
      };
      const p = Math.max(1, Number(s.portfolio) || 1);
      const r = Math.max(0, Number(s.rate) || 0);
      const a = Math.max(1, Math.floor(Number(s.age) || 1));
      const le = Math.max(a + 1, Math.floor(Number(s.lifeExpectancy) || a + 1));
      const c = Math.max(0, Number(s.contribution) || 0);
      setDraftPortfolio(p); setDraftRate(r); setDraftAge(a);
      setDraftLifeExpectancy(le); setDraftContribution(c);
      setPortfolio(p); setRate(r); setAge(a);
      setLifeExpectancy(le); setContribution(c);
      setCalculated(true);
    } catch { /* ignore */ }
  }, []);

  const isDirty =
    Number(draftPortfolio) !== portfolio ||
    Number(draftRate) !== rate ||
    Number(draftAge) !== age ||
    Number(draftLifeExpectancy) !== lifeExpectancy ||
    Number(draftContribution) !== contribution;

  const handleCalculate = () => {
    const p = Math.max(1, Math.floor(Number(draftPortfolio) || 1));
    const r = Math.max(0, Number(draftRate) || 0);
    const a = Math.max(1, Math.floor(Number(draftAge) || 1));
    const le = Math.max(a + 1, Math.floor(Number(draftLifeExpectancy) || a + 1));
    const c = Math.max(0, Math.floor(Number(draftContribution) || 0));
    setDraftPortfolio(p); setDraftRate(r); setDraftAge(a);
    setDraftLifeExpectancy(le); setDraftContribution(c);
    setPortfolio(p); setRate(r); setAge(a);
    setLifeExpectancy(le); setContribution(c);
    setCalculated(true);
    try {
      window.localStorage.setItem(RD_STORAGE_KEY, JSON.stringify({
        portfolio: p, rate: r, age: a, lifeExpectancy: le, contribution: c,
      }));
    } catch { /* ignore */ }
  };

  const months = Math.max(0, (lifeExpectancy - age) * 12);
  const years = lifeExpectancy - age;

  const monthlyWithdrawal = useMemo(
    () => solveWithdrawal(portfolio, rate, months, contribution),
    [portfolio, rate, months, contribution],
  );

  const chartData = useMemo(
    () => simulateDrawdown(portfolio, rate, months, contribution, monthlyWithdrawal),
    [portfolio, rate, months, contribution, monthlyWithdrawal],
  );

  const annualWithdrawal = monthlyWithdrawal * 12;
  const lifetimeWithdrawn = monthlyWithdrawal * months;
  const lifetimeContributed = contribution * months;
  const netDrawdown = lifetimeWithdrawn - lifetimeContributed;

  const draftYears = Math.max(0, Number(draftLifeExpectancy) - Number(draftAge));

  return (
    <div style={{ maxWidth: 1200, margin: "0 auto" }}>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
          gap: 16,
        }}
      >
        <div className="stat-card slider-wrap">
          <div className="slider-label">
            <span>Current Portfolio ($)</span>
            <span className="slider-val">{fmt(Number(draftPortfolio) || 0)}</span>
          </div>
          <input
            className="num-input"
            type="number"
            min={1}
            step={10000}
            value={draftPortfolio}
            onChange={(e) => setDraftPortfolio(e.target.value === "" ? "" : +e.target.value)}
          />
        </div>

        <div className="stat-card slider-wrap">
          <div className="slider-label">
            <span>Annual Return Rate (%)</span>
            <span className="slider-val">{Number(draftRate) || 0}%</span>
          </div>
          <input
            className="num-input"
            type="number"
            min={0}
            step={0.1}
            value={draftRate}
            onChange={(e) => setDraftRate(e.target.value === "" ? "" : +e.target.value)}
          />
        </div>

        <div className="stat-card slider-wrap">
          <div className="slider-label">
            <span>Current Age</span>
            <span className="slider-val">{Number(draftAge) || 0} yrs</span>
          </div>
          <input
            className="num-input"
            type="number"
            min={1}
            max={120}
            step={1}
            value={draftAge}
            onChange={(e) => setDraftAge(e.target.value === "" ? "" : +e.target.value)}
          />
        </div>

        <div className="stat-card slider-wrap">
          <div className="slider-label">
            <span>Life Expectancy</span>
            <span className="slider-val">{Number(draftLifeExpectancy) || 0} yrs · {draftYears} yrs left</span>
          </div>
          <input
            className="num-input"
            type="number"
            min={Number(draftAge) + 1 || 2}
            max={130}
            step={1}
            value={draftLifeExpectancy}
            onChange={(e) => setDraftLifeExpectancy(e.target.value === "" ? "" : +e.target.value)}
          />
        </div>

        <div className="stat-card slider-wrap">
          <div className="slider-label">
            <span>Monthly Contribution ($)</span>
            <span className="slider-val">{fmt(Number(draftContribution) || 0)}</span>
          </div>
          <input
            className="num-input"
            type="number"
            min={0}
            step={100}
            value={draftContribution}
            onChange={(e) => setDraftContribution(e.target.value === "" ? "" : +e.target.value)}
          />
        </div>
      </div>

      <div className="calc-bar">
        <span className="calc-hint">{isDirty ? "Unapplied changes — press Calculate" : ""}</span>
        <button
          className="calc-btn"
          onClick={handleCalculate}
          disabled={!isDirty && calculated}
          type="button"
        >
          CALCULATE
        </button>
      </div>

      {calculated && (
        <>
          <div className="section">
            <h2 className="section-title">RETIREMENT DRAWDOWN RESULTS</h2>
            <p style={{ color: "#666", fontSize: 12, marginTop: -8, marginBottom: 20 }}>
              Exact monthly withdrawal to reach $0 at age {lifeExpectancy} · {years}-year horizon ·{" "}
              {rate}% annual return{contribution > 0 ? ` · +${fmt(contribution)}/mo contribution` : ""}
            </p>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
                gap: 12,
                marginBottom: 4,
              }}
            >
              {[
                {
                  label: "MONTHLY WITHDRAWAL",
                  value: fmtExact(monthlyWithdrawal),
                  sub: "Take this every month",
                  color: "#00ff87",
                  big: true,
                },
                {
                  label: "ANNUAL WITHDRAWAL",
                  value: fmt(annualWithdrawal),
                  sub: "Per year total",
                  color: "#00d4ff",
                  big: false,
                },
                {
                  label: "LIFETIME WITHDRAWN",
                  value: fmt(lifetimeWithdrawn),
                  sub: `Over ${years} years`,
                  color: "#ffbe0b",
                  big: false,
                },
                {
                  label: "NET FROM PORTFOLIO",
                  value: fmt(netDrawdown),
                  sub: `After ${fmt(lifetimeContributed)} contributed`,
                  color: "#ff6b6b",
                  big: false,
                },
              ].map(({ label, value, sub, color, big }) => (
                <div
                  key={label}
                  style={{
                    background: "#0e0e18",
                    border: `1px solid ${color}33`,
                    borderRadius: 12,
                    padding: "18px 20px",
                  }}
                >
                  <div style={{ fontSize: 11, color: "#666", letterSpacing: 1.5, marginBottom: 6 }}>
                    {label}
                  </div>
                  <div
                    style={{
                      fontFamily: "'Bebas Neue', sans-serif",
                      fontSize: big ? 36 : 28,
                      color,
                      lineHeight: 1,
                    }}
                  >
                    {value}
                  </div>
                  <div style={{ fontSize: 11, color: "#555", marginTop: 6 }}>{sub}</div>
                </div>
              ))}
            </div>
          </div>

          <div className="section">
            <h2 className="section-title">PORTFOLIO BALANCE DECAY</h2>
            <p style={{ color: "#666", fontSize: 12, marginTop: -8, marginBottom: 14 }}>
              Balance declines to exactly $0 at age {lifeExpectancy}
            </p>
            <div style={{ width: "100%", height: 360 }}>
              <ResponsiveContainer>
                <AreaChart data={chartData} margin={{ top: 10, right: 20, bottom: 0, left: 0 }}>
                  <defs>
                    <linearGradient id="balanceGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#00d4ff" stopOpacity={0.2} />
                      <stop offset="95%" stopColor="#00d4ff" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke="#1a1a28" strokeDasharray="3 3" />
                  <XAxis
                    dataKey="year"
                    stroke="#555"
                    tick={{ fill: "#666", fontSize: 11 }}
                    tickFormatter={(v) => `Yr ${v}\nAge ${age + v}`}
                    label={{ value: "Years into retirement", position: "insideBottom", offset: -5, fill: "#555", fontSize: 11 }}
                  />
                  <YAxis
                    stroke="#555"
                    tick={{ fill: "#666", fontSize: 11 }}
                    tickFormatter={(v) => fmt(Number(v))}
                  />
                  <Tooltip
                    content={
                      <CustomTooltip currentAge={age} />
                    }
                  />
                  {[Math.round(years * 0.25), Math.round(years * 0.5), Math.round(years * 0.75)].map((y) => (
                    <ReferenceLine
                      key={y}
                      x={y}
                      stroke="#333"
                      strokeDasharray="4 4"
                      label={{ value: `Age ${age + y}`, position: "top", fill: "#555", fontSize: 10 }}
                    />
                  ))}
                  <Area
                    type="monotone"
                    dataKey="balance"
                    name="Portfolio Balance"
                    stroke="#00d4ff"
                    strokeWidth={2.5}
                    fill="url(#balanceGrad)"
                    dot={false}
                    activeDot={{ r: 4, fill: "#00d4ff" }}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="section">
            <h2 className="section-title">YEAR-BY-YEAR BALANCE</h2>
            <div style={{ overflowX: "auto" }}>
              <table>
                <thead>
                  <tr>
                    {["Year", "Age", "Portfolio Balance", "Annual Withdrawn", "Remaining %"].map((h) => (
                      <th key={h}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {chartData.map((d) => {
                    const pct = portfolio > 0 ? ((d.balance / portfolio) * 100).toFixed(0) : "0";
                    const annualWd = Math.round(annualWithdrawal - contribution * 12);
                    const depleting = d.balance < portfolio * 0.25;
                    return (
                      <tr key={d.year}>
                        <td style={{ color: "#888" }}>
                          {d.year === 0 ? "Start" : `Year ${d.year}`}
                        </td>
                        <td style={{ color: "#aaa" }}>{age + d.year}</td>
                        <td
                          style={{
                            color: depleting ? "#ff6b6b" : d.balance < portfolio * 0.5 ? "#ffbe0b" : "#00d4ff",
                            fontWeight: 500,
                          }}
                        >
                          {fmt(d.balance)}
                        </td>
                        <td style={{ color: "#666" }}>
                          {d.year === 0 ? "—" : fmt(Math.max(0, annualWd))}
                        </td>
                        <td>
                          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            <div
                              style={{
                                height: 4,
                                width: `${Math.max(2, Number(pct))}%`,
                                maxWidth: 80,
                                background: depleting ? "#ff6b6b" : Number(pct) < 50 ? "#ffbe0b" : "#00d4ff",
                                borderRadius: 2,
                                transition: "width 0.3s",
                              }}
                            />
                            <span style={{ color: "#666", fontSize: 11 }}>{pct}%</span>
                          </div>
                        </td>
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
                <span style={{ color: "#555", letterSpacing: 1 }}>DRAWDOWN PERIOD</span>
                <span style={{ color: "#aaa", marginLeft: 10 }}>{years} years ({months.toLocaleString()} months)</span>
              </div>
              <div>
                <span style={{ color: "#555", letterSpacing: 1 }}>MONTHLY RATE</span>
                <span style={{ color: "#aaa", marginLeft: 10 }}>{(rate / 12).toFixed(3)}%</span>
              </div>
              <div>
                <span style={{ color: "#555", letterSpacing: 1 }}>PORTFOLIO EXHAUSTED</span>
                <span style={{ color: "#00ff87", marginLeft: 10 }}>Age {lifeExpectancy} exactly</span>
              </div>
            </div>
          </div>
        </>
      )}

      {!calculated && (
        <div className="section" style={{ textAlign: "center", padding: "40px 22px", color: "#444" }}>
          <div style={{ fontSize: 36, marginBottom: 12 }}>🏦</div>
          <div style={{ fontSize: 14, letterSpacing: 1 }}>
            Enter your details above and press CALCULATE to see your retirement drawdown plan
          </div>
        </div>
      )}
    </div>
  );
}
