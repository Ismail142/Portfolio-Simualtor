import { useEffect, useMemo, useState } from "react";
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

type Frequency = "monthly" | "quarterly" | "annually" | "weekly";

const FREQ_OPTIONS: { label: string; value: Frequency; perYear: number }[] = [
  { label: "Monthly", value: "monthly", perYear: 12 },
  { label: "Quarterly", value: "quarterly", perYear: 4 },
  { label: "Annually", value: "annually", perYear: 1 },
  { label: "Weekly", value: "weekly", perYear: 52 },
];

const MILESTONE_YEARS = [5, 10, 20, 30];
const MILESTONE_COLORS = ["#00d4ff", "#ffbe0b", "#ff6b6b", "#8338ec"];

const fmt = (n: number) =>
  n >= 1_000_000
    ? `$${(n / 1_000_000).toFixed(2)}M`
    : n >= 1000
      ? `$${(n / 1000).toFixed(2)}K`
      : `$${n.toFixed(2)}`;

function computeGrowth(
  principal: number,
  annualRate: number,
  contributionPerPeriod: number,
  periodsPerYear: number,
  years: number,
): { year: number; value: number; contributed: number }[] {
  const ratePerPeriod = annualRate / 100 / periodsPerYear;
  const data: { year: number; value: number; contributed: number }[] = [];

  for (let y = 0; y <= years; y++) {
    const n = y * periodsPerYear;
    let value: number;
    if (ratePerPeriod === 0) {
      value = principal + contributionPerPeriod * n;
    } else {
      value =
        principal * Math.pow(1 + ratePerPeriod, n) +
        contributionPerPeriod * ((Math.pow(1 + ratePerPeriod, n) - 1) / ratePerPeriod);
    }
    const contributed = principal + contributionPerPeriod * n;
    data.push({ year: y, value, contributed });
  }
  return data;
}

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

const CG_STORAGE_KEY = "compound-growth-inputs";

export default function CompoundGrowth() {
  const [draftPrincipal, setDraftPrincipal] = useState<number | "">(10000);
  const [draftRate, setDraftRate] = useState<number | "">(8);
  const [draftContribution, setDraftContribution] = useState<number | "">(500);
  const [draftFrequency, setDraftFrequency] = useState<Frequency>("monthly");
  const [draftYears, setDraftYears] = useState<number | "">(20);

  const [principal, setPrincipal] = useState(10000);
  const [rate, setRate] = useState(8);
  const [contribution, setContribution] = useState(500);
  const [frequency, setFrequency] = useState<Frequency>("monthly");
  const [years, setYears] = useState(20);
  const [calculated, setCalculated] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = window.localStorage.getItem(CG_STORAGE_KEY);
      if (!raw) return;
      const saved = JSON.parse(raw) as {
        principal?: number;
        rate?: number;
        contribution?: number;
        frequency?: Frequency;
        years?: number;
      };
      const p = Math.max(0, Number(saved.principal) || 0);
      const r = Math.max(0, Number(saved.rate) || 0);
      const c = Math.max(0, Number(saved.contribution) || 0);
      const y = Math.max(1, Math.floor(Number(saved.years) || 1));
      const freq: Frequency =
        FREQ_OPTIONS.find((f) => f.value === saved.frequency)?.value ?? "monthly";
      setDraftPrincipal(p);
      setDraftRate(r);
      setDraftContribution(c);
      setDraftFrequency(freq);
      setDraftYears(y);
      setPrincipal(p);
      setRate(r);
      setContribution(c);
      setFrequency(freq);
      setYears(y);
      setCalculated(true);
    } catch {
      /* ignore corrupt storage */
    }
  }, []);

  const isDirty =
    Number(draftPrincipal) !== principal ||
    Number(draftRate) !== rate ||
    Number(draftContribution) !== contribution ||
    draftFrequency !== frequency ||
    Number(draftYears) !== years;

  const freqInfo = FREQ_OPTIONS.find((f) => f.value === frequency)!;
  const draftFreqInfo = FREQ_OPTIONS.find((f) => f.value === draftFrequency)!;

  const handleCalculate = () => {
    const p = Math.max(0, Number(draftPrincipal) || 0);
    const r = Math.max(0, Number(draftRate) || 0);
    const c = Math.max(0, Number(draftContribution) || 0);
    const y = Math.max(1, Math.floor(Number(draftYears) || 1));
    setDraftPrincipal(p);
    setDraftRate(r);
    setDraftContribution(c);
    setDraftYears(y);
    setPrincipal(p);
    setRate(r);
    setContribution(c);
    setFrequency(draftFrequency);
    setYears(y);
    setCalculated(true);
    if (typeof window !== "undefined") {
      try {
        window.localStorage.setItem(
          CG_STORAGE_KEY,
          JSON.stringify({ principal: p, rate: r, contribution: c, frequency: draftFrequency, years: y }),
        );
      } catch {
        /* storage may be unavailable */
      }
    }
  };

  const growthData = useMemo(() => {
    return computeGrowth(principal, rate, contribution, freqInfo.perYear, years);
  }, [principal, rate, contribution, freqInfo.perYear, years]);

  const milestoneData = useMemo(() => {
    const customYear = years;
    const allMilestones = [...new Set([...MILESTONE_YEARS, customYear])].filter(
      (y) => y <= customYear,
    );
    return allMilestones.map((y) => {
      const point = computeGrowth(principal, rate, contribution, freqInfo.perYear, y);
      const last = point[point.length - 1];
      const interest = last.value - last.contributed;
      return { year: y, value: last.value, contributed: last.contributed, interest };
    });
  }, [principal, rate, contribution, freqInfo.perYear, years]);

  const maxYear = growthData[growthData.length - 1]?.year ?? years;

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
            <span>Starting Amount ($)</span>
            <span className="slider-val">{fmt(Number(draftPrincipal) || 0)}</span>
          </div>
          <input
            className="num-input"
            type="number"
            min={0}
            step={1000}
            value={draftPrincipal}
            onChange={(e) => setDraftPrincipal(e.target.value === "" ? "" : +e.target.value)}
          />
        </div>

        <div className="stat-card slider-wrap">
          <div className="slider-label">
            <span>Annual Interest Rate (%)</span>
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
            <span>Contribution ({draftFreqInfo.label})</span>
            <span className="slider-val">{fmt(Number(draftContribution) || 0)}</span>
          </div>
          <input
            className="num-input"
            type="number"
            min={0}
            step={50}
            value={draftContribution}
            onChange={(e) => setDraftContribution(e.target.value === "" ? "" : +e.target.value)}
          />
        </div>

        <div className="stat-card slider-wrap">
          <div className="slider-label">
            <span>Contribution Frequency</span>
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 4 }}>
            {FREQ_OPTIONS.map((f) => (
              <button
                key={f.value}
                type="button"
                className={`rate-btn ${draftFrequency === f.value ? "active" : ""}`}
                style={{ color: draftFrequency === f.value ? "#00ff87" : undefined, fontSize: 11, padding: "5px 10px" }}
                onClick={() => setDraftFrequency(f.value)}
              >
                {f.label.toUpperCase()}
              </button>
            ))}
          </div>
        </div>

        <div className="stat-card slider-wrap">
          <div className="slider-label">
            <span>Years</span>
            <span className="slider-val">{Number(draftYears) || 0} yrs</span>
          </div>
          <input
            className="num-input"
            type="number"
            min={1}
            step={1}
            value={draftYears}
            onChange={(e) => setDraftYears(e.target.value === "" ? "" : +e.target.value)}
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

      {(calculated || !isDirty) && (
        <>
          <div className="section">
            <h2 className="section-title">GROWTH MILESTONES</h2>
            <p style={{ color: "#666", fontSize: 12, marginTop: -8, marginBottom: 16 }}>
              Portfolio value at key time horizons · {freqInfo.label.toLowerCase()} contributions of{" "}
              {fmt(contribution)} · {rate}% annual rate
            </p>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
                gap: 12,
              }}
            >
              {milestoneData.map((m, i) => {
                const isCustom = m.year === years && !MILESTONE_YEARS.includes(m.year);
                const color = isCustom ? "#00ff87" : MILESTONE_COLORS[MILESTONE_YEARS.indexOf(m.year)] ?? "#00ff87";
                return (
                  <div
                    key={m.year}
                    style={{
                      background: "#0e0e18",
                      border: `1px solid ${color}33`,
                      borderRadius: 12,
                      padding: "16px 18px",
                    }}
                  >
                    <div
                      style={{
                        fontFamily: "'Bebas Neue', sans-serif",
                        fontSize: 28,
                        color,
                        lineHeight: 1,
                      }}
                    >
                      {fmt(m.value)}
                    </div>
                    <div
                      style={{
                        fontSize: 11,
                        color: "#888",
                        letterSpacing: 1.5,
                        marginTop: 4,
                        marginBottom: 10,
                      }}
                    >
                      YEAR {m.year}{isCustom ? " (CUSTOM)" : ""}
                    </div>
                    <div style={{ fontSize: 11, color: "#555", lineHeight: 1.8 }}>
                      <div>
                        Invested:{" "}
                        <span style={{ color: "#aaa" }}>{fmt(m.contributed)}</span>
                      </div>
                      <div>
                        Growth:{" "}
                        <span style={{ color: "#00ff87" }}>+{fmt(Math.max(0, m.interest))}</span>
                      </div>
                      <div>
                        Return:{" "}
                        <span style={{ color }}>
                          {m.contributed > 0
                            ? `${(((m.value - m.contributed) / m.contributed) * 100).toFixed(2)}%`
                            : "—"}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="section">
            <h2 className="section-title">PORTFOLIO VALUE OVER TIME</h2>
            <div style={{ width: "100%", height: 360 }}>
              <ResponsiveContainer>
                <LineChart data={growthData} margin={{ top: 10, right: 20, bottom: 0, left: 0 }}>
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
                  {MILESTONE_YEARS.filter((y) => y <= maxYear).map((y, i) => (
                    <ReferenceLine
                      key={y}
                      x={y}
                      stroke={MILESTONE_COLORS[i]}
                      strokeDasharray="4 4"
                      strokeOpacity={0.5}
                    />
                  ))}
                  <Line
                    type="monotone"
                    dataKey="value"
                    name="Total Value"
                    stroke="#00ff87"
                    strokeWidth={2.5}
                    dot={false}
                    activeDot={{ r: 4 }}
                  />
                  <Line
                    type="monotone"
                    dataKey="contributed"
                    name="Amount Invested"
                    stroke="#444"
                    strokeWidth={1.5}
                    strokeDasharray="5 5"
                    dot={false}
                    activeDot={{ r: 3 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="section">
            <h2 className="section-title">YEAR-BY-YEAR BREAKDOWN</h2>
            <div style={{ overflowX: "auto" }}>
              <table>
                <thead>
                  <tr>
                    {["Year", "Total Value", "Amount Invested", "Interest Earned", "Return"].map(
                      (h) => (
                        <th key={h}>{h}</th>
                      ),
                    )}
                  </tr>
                </thead>
                <tbody>
                  {growthData
                    .filter((d) => {
                      const milestones = [...new Set([...MILESTONE_YEARS, years])].filter(
                        (y) => y <= years,
                      );
                      return milestones.includes(d.year) || d.year === 0;
                    })
                    .map((d) => {
                      const interest = d.value - d.contributed;
                      const pct =
                        d.contributed > 0
                          ? (((d.value - d.contributed) / d.contributed) * 100).toFixed(2)
                          : "0.00";
                      const isCustom = d.year === years && !MILESTONE_YEARS.includes(d.year);
                      const milestoneIdx = MILESTONE_YEARS.indexOf(d.year);
                      const color =
                        d.year === 0
                          ? "#888"
                          : isCustom
                            ? "#00ff87"
                            : milestoneIdx >= 0
                              ? MILESTONE_COLORS[milestoneIdx]
                              : "#aaa";
                      return (
                        <tr key={d.year}>
                          <td style={{ color, fontWeight: 500 }}>
                            {d.year === 0 ? "Start" : `Year ${d.year}${isCustom ? " ★" : ""}`}
                          </td>
                          <td style={{ color: "#00ff87" }}>{fmt(d.value)}</td>
                          <td style={{ color: "#aaa" }}>{fmt(d.contributed)}</td>
                          <td style={{ color: interest >= 0 ? "#00ff87" : "#ff6b6b" }}>
                            {interest >= 0 ? "+" : ""}
                            {fmt(interest)}
                          </td>
                          <td style={{ color: "#ffbe0b" }}>{pct}%</td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {!calculated && isDirty && (
        <div
          className="section"
          style={{ textAlign: "center", padding: "40px 22px", color: "#444" }}
        >
          <div style={{ fontSize: 36, marginBottom: 12 }}>📈</div>
          <div style={{ fontSize: 14, letterSpacing: 1 }}>
            Enter your values above and press CALCULATE to see your compound growth projection
          </div>
        </div>
      )}
    </div>
  );
}
