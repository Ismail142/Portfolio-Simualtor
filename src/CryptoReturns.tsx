import { useEffect, useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { BTC_RETURNS as RETURNS } from "./data/bitcoinReturns";

const YEARS = Object.keys(RETURNS)
  .map(Number)
  .sort((a, b) => a - b);

const MIN_YEAR = YEARS[0];
const MAX_YEAR = YEARS[YEARS.length - 1];
const MAX_DURATION = MAX_YEAR - MIN_YEAR + 1; // full data span

const STORAGE_KEY = "crypto-returns-duration";

type PeriodStat = {
  start: number;
  end: number;
  returns: number[];
  cagr: number;
  cumulative: number;
  avgAnnual: number;
};

function computeCAGR(returns: number[]): number {
  // returns are in percent, e.g. 17.88
  let wealth = 1;
  for (const r of returns) {
    wealth *= 1 + r / 100;
  }
  return (Math.pow(wealth, 1 / returns.length) - 1) * 100;
}

function computeCumulative(returns: number[]): number {
  let wealth = 1;
  for (const r of returns) {
    wealth *= 1 + r / 100;
  }
  return wealth; // multiple of starting capital
}

function buildPeriods(window: number): PeriodStat[] {
  const maxStart = MAX_YEAR - window + 1;
  const out: PeriodStat[] = [];
  for (let start = MIN_YEAR; start <= maxStart; start++) {
    const returns: number[] = [];
    for (let y = start; y < start + window; y++) {
      returns.push(RETURNS[y] ?? 0);
    }
    const cagr = computeCAGR(returns);
    const cumulative = computeCumulative(returns);
    const avgAnnual = returns.reduce((s, r) => s + r, 0) / returns.length;
    out.push({ start, end: start + window - 1, returns, cagr, cumulative, avgAnnual });
  }
  return out;
}

const fmtPct = (n: number) => `${n >= 0 ? "+" : ""}${n.toFixed(2)}%`;
const fmtMult = (n: number) => `${n.toFixed(2)}×`;

type TipPayload = { name?: string; value?: number; color?: string; payload?: Record<string, unknown> };

const ChartTooltip = ({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: TipPayload[];
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
        {label}
      </div>
      {payload.map((p, i) => (
        <div key={i} style={{ color: p.color ?? "#00ff87", lineHeight: 1.7 }}>
          {p.name}: {typeof p.value === "number" ? fmtPct(p.value) : p.value}
        </div>
      ))}
    </div>
  );
};

function buildBins(returns: number[]) {
  // Wider edges to capture Bitcoin's extreme annual moves
  const edges = [-80, -50, -30, -10, 0, 20, 50, 100, 200, 500, 1000, 2000];
  const bins = edges.slice(0, -1).map((lo, i) => {
    const hi = edges[i + 1];
    const count = returns.filter((r) => r >= lo && r < hi).length;
    const label =
      i === 0
        ? `<${hi}%`
        : i === edges.length - 2
          ? `≥${lo}%`
          : `${lo} to ${hi}`;
    return { label, count, lo, hi };
  });
  // catch anything above last edge
  const lastHi = edges[edges.length - 1];
  const overflow = returns.filter((r) => r >= lastHi).length;
  if (overflow > 0) {
    bins[bins.length - 1].count += overflow;
  }
  return bins;
}

export default function CryptoReturns() {
  const defaultDuration = Math.min(5, MAX_DURATION);
  const [draftDuration, setDraftDuration] = useState<number | "">(defaultDuration);
  const [duration, setDuration] = useState(defaultDuration);
  const [selectedStart, setSelectedStart] = useState(MIN_YEAR);

  // Restore saved duration on mount
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const n = Math.floor(Number(raw));
      if (!Number.isFinite(n) || n < 1 || n > MAX_DURATION) return;
      setDraftDuration(n);
      setDuration(n);
    } catch {
      /* ignore */
    }
  }, []);

  const allPeriods = useMemo(() => buildPeriods(duration), [duration]);

  const maxStart = MAX_YEAR - duration + 1;

  // Keep selectedStart valid when duration changes
  useEffect(() => {
    if (allPeriods.length === 0) return;
    const stillValid = allPeriods.some((p) => p.start === selectedStart);
    if (!stillValid) {
      const preferred = allPeriods[0];
      setSelectedStart(preferred.start);
    }
  }, [duration, allPeriods, selectedStart]);

  const sortedByCagr = useMemo(
    () => [...allPeriods].sort((a, b) => a.cagr - b.cagr),
    [allPeriods],
  );
  const worst = sortedByCagr[0];
  const best = sortedByCagr[sortedByCagr.length - 1];
  const median = sortedByCagr[Math.floor(sortedByCagr.length / 2)];

  // Full-history (all-time) stats — independent of the selected window duration
  const allTime = useMemo(() => {
    const returns = YEARS.map((y) => RETURNS[y] ?? 0);
    return {
      start: MIN_YEAR,
      end: MAX_YEAR,
      returns,
      cagr: computeCAGR(returns),
      cumulative: computeCumulative(returns),
      avgAnnual: returns.reduce((s, r) => s + r, 0) / returns.length,
    };
  }, []);

  const selected = useMemo(
    () => allPeriods.find((p) => p.start === selectedStart) ?? allPeriods[0],
    [allPeriods, selectedStart],
  );

  const annualBars = useMemo(
    () =>
      selected
        ? selected.returns.map((r, i) => ({
            year: selected.start + i,
            return: r,
          }))
        : [],
    [selected],
  );

  const bins = useMemo(
    () => (selected ? buildBins(selected.returns) : []),
    [selected],
  );

  const cagrSeries = useMemo(
    () =>
      allPeriods.map((p) => ({
        start: p.start,
        cagr: +p.cagr.toFixed(2),
        end: p.end,
        cumulative: +p.cumulative.toFixed(2),
      })),
    [allPeriods],
  );

  const positiveCount = selected ? selected.returns.filter((r) => r >= 0).length : 0;
  const negativeCount = selected ? selected.returns.length - positiveCount : 0;

  const isDirty = Number(draftDuration) !== duration;

  const handleCalculate = () => {
    let n = Math.floor(Number(draftDuration) || Math.min(5, MAX_DURATION));
    if (!Number.isFinite(n) || n < 1) n = 1;
    if (n > MAX_DURATION) n = MAX_DURATION;
    setDraftDuration(n);
    setDuration(n);
    try {
      window.localStorage.setItem(STORAGE_KEY, String(n));
    } catch {
      /* ignore */
    }
  };

  const windowLabel = `${duration}-YR`;
  const windowLabelLong = `${duration}-year`;

  if (!selected || !best || !worst || !median) {
    return (
      <div style={{ fontFamily: "'DM Mono', monospace", color: "#888", padding: 24 }}>
        Not enough historical data for a {duration}-year window.
      </div>
    );
  }

  return (
    <div style={{ fontFamily: "'DM Mono', monospace" }}>
      {/* Duration input + Calculate */}
      <div
        style={{
          background: "#0e0e18",
          border: "1px solid #1a1a28",
          borderRadius: 12,
          padding: "18px 20px",
          marginBottom: 22,
          display: "flex",
          flexWrap: "wrap",
          alignItems: "flex-end",
          gap: 16,
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 8, minWidth: 160 }}>
          <label
            style={{
              fontSize: 12,
              color: "#888",
              letterSpacing: 0.5,
            }}
          >
            WINDOW DURATION (YEARS)
          </label>
          <input
            type="number"
            className="num-input"
            min={1}
            max={MAX_DURATION}
            value={draftDuration}
            onChange={(e) => {
              const v = e.target.value;
              if (v === "") {
                setDraftDuration("");
                return;
              }
              const n = Math.floor(Number(v));
              if (!Number.isFinite(n)) return;
              setDraftDuration(n);
            }}
            style={{
              width: 120,
              background: "#07070d",
              border: "1px solid #1a1a28",
              color: "#00ff87",
              fontFamily: "'DM Mono', monospace",
              fontSize: 15,
              padding: "8px 10px",
              borderRadius: 6,
              outline: "none",
              textAlign: "right",
            }}
            onFocus={(e) => {
              e.currentTarget.style.borderColor = "#00ff87";
              e.currentTarget.style.boxShadow = "0 0 0 2px #00ff8722";
            }}
            onBlur={(e) => {
              e.currentTarget.style.borderColor = "#1a1a28";
              e.currentTarget.style.boxShadow = "none";
            }}
          />
          <span style={{ fontSize: 11, color: "#555" }}>
            1 – {MAX_DURATION} (data {MIN_YEAR}–{MAX_YEAR})
          </span>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
          {isDirty && (
            <span style={{ fontSize: 12, color: "#ffbe0b", letterSpacing: 0.5 }}>
              Inputs changed — click Calculate
            </span>
          )}
          <button
            type="button"
            onClick={handleCalculate}
            disabled={!isDirty}
            style={{
              background: isDirty ? "#00ff87" : "#1a1a28",
              color: isDirty ? "#050510" : "#555",
              border: "none",
              padding: "12px 28px",
              borderRadius: 8,
              fontFamily: "'Bebas Neue', sans-serif",
              fontSize: 16,
              letterSpacing: 3,
              cursor: isDirty ? "pointer" : "not-allowed",
              boxShadow: isDirty ? "0 0 20px #00ff8744" : "none",
              transition: "all 0.15s",
            }}
          >
            CALCULATE
          </button>
        </div>
      </div>

      {/* Summary cards */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
          gap: 14,
          marginBottom: 22,
        }}
      >
        {[
          {
            title: `BEST ${windowLabel}`,
            startYear: best.start,
            period: `${best.start}–${best.end}`,
            value: fmtPct(best.cagr),
            sub: `${fmtMult(best.cumulative)} cumulative`,
            color: "#00ff87",
            isAllTime: false,
          },
          {
            title: `MEDIAN ${windowLabel}`,
            startYear: median.start,
            period: `${median.start}–${median.end}`,
            value: fmtPct(median.cagr),
            sub: `${fmtMult(median.cumulative)} cumulative`,
            color: "#00d4ff",
            isAllTime: false,
          },
          {
            title: `WORST ${windowLabel}`,
            startYear: worst.start,
            period: `${worst.start}–${worst.end}`,
            value: fmtPct(worst.cagr),
            sub: `${fmtMult(worst.cumulative)} cumulative`,
            color: "#ff6b6b",
            isAllTime: false,
          },
          {
            title: "ALL-TIME",
            startYear: allTime.start,
            period: `${allTime.start}–${allTime.end}`,
            value: fmtPct(allTime.cagr),
            sub: `${fmtMult(allTime.cumulative)} cumulative`,
            color: "#ffbe0b",
            isAllTime: true,
          },
        ].map((card) => (
          <div
            key={card.title}
            className="stat-card"
            style={{
              background: "#0e0e18",
              border: "1px solid #1a1a28",
              borderRadius: 12,
              padding: "18px 20px",
              cursor: "pointer",
              transition: "border-color 0.15s",
            }}
            onClick={() => {
              if (card.isAllTime) {
                setDraftDuration(MAX_DURATION);
                setDuration(MAX_DURATION);
                setSelectedStart(MIN_YEAR);
                try {
                  window.localStorage.setItem(STORAGE_KEY, String(MAX_DURATION));
                } catch {
                  /* ignore */
                }
              } else {
                setSelectedStart(card.startYear);
              }
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLDivElement).style.borderColor = card.color;
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLDivElement).style.borderColor = "#1a1a28";
            }}
          >
            <div
              style={{
                fontFamily: "'Bebas Neue', sans-serif",
                fontSize: 12,
                letterSpacing: 2,
                color: "#666",
                marginBottom: 8,
              }}
            >
              {card.title}
            </div>
            <div style={{ fontSize: 22, color: card.color, fontWeight: 500, marginBottom: 4 }}>
              {card.value} <span style={{ fontSize: 13, color: "#888" }}>CAGR</span>
            </div>
            <div style={{ fontSize: 12, color: "#888" }}>
              {card.period} · {card.sub}
            </div>
          </div>
        ))}
      </div>

      {/* Rolling CAGR overview */}
      <div
        className="section"
        style={{
          background: "#0a0a14",
          border: "1px solid #15151f",
          borderRadius: 14,
          padding: 22,
          marginBottom: 22,
        }}
      >
        <h2
          style={{
            fontFamily: "'Bebas Neue', sans-serif",
            fontSize: 14,
            letterSpacing: 3,
            color: "#888",
            margin: "0 0 6px",
          }}
        >
          ROLLING {duration}-YEAR CAGR · ALL START YEARS
        </h2>
        <p style={{ color: "#666", fontSize: 12, margin: "0 0 16px" }}>
          Each point is the annualized return of the {windowLabelLong} window beginning that year
          ({MIN_YEAR}–{maxStart}). Click a point or use the selector below to inspect a period.
        </p>
        <div style={{ width: "100%", height: 280 }}>
          <ResponsiveContainer>
            <LineChart
              data={cagrSeries}
              margin={{ top: 10, right: 16, bottom: 0, left: 0 }}
              onClick={(state) => {
                if (state?.activePayload?.[0]?.payload?.start) {
                  setSelectedStart(state.activePayload[0].payload.start as number);
                }
              }}
            >
              <CartesianGrid stroke="#1a1a28" strokeDasharray="3 3" />
              <XAxis
                dataKey="start"
                stroke="#555"
                tick={{ fill: "#666", fontSize: 11 }}
                tickFormatter={(v) => String(v)}
              />
              <YAxis
                stroke="#555"
                tick={{ fill: "#666", fontSize: 11 }}
                tickFormatter={(v) => `${v}%`}
                domain={["auto", "auto"]}
              />
              <Tooltip content={<ChartTooltip />} />
              <ReferenceLine y={median.cagr} stroke="#00d4ff44" strokeDasharray="4 4" />
              <Line
                type="monotone"
                dataKey="cagr"
                name={`${duration}-yr CAGR`}
                stroke="#00ff87"
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 5, fill: "#00ff87" }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Period selector */}
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          alignItems: "center",
          gap: 12,
          marginBottom: 18,
        }}
      >
        <span style={{ fontSize: 12, color: "#888", letterSpacing: 1.5 }}>
          SELECT {duration}-YR WINDOW
        </span>
        <select
          value={selectedStart}
          onChange={(e) => setSelectedStart(Number(e.target.value))}
          style={{
            background: "#0e0e18",
            border: "1px solid #1a1a28",
            color: "#00ff87",
            fontFamily: "'DM Mono', monospace",
            fontSize: 14,
            padding: "8px 12px",
            borderRadius: 8,
            outline: "none",
            cursor: "pointer",
          }}
        >
          {allPeriods.map((p) => (
            <option key={p.start} value={p.start}>
              {p.start} – {p.end} · CAGR {fmtPct(p.cagr)}
            </option>
          ))}
        </select>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {[
            { label: "Best", start: best.start },
            { label: "Median", start: median.start },
            { label: "Worst", start: worst.start },
          ].map((b) => (
            <button
              key={b.label}
              type="button"
              onClick={() => setSelectedStart(b.start)}
              style={{
                background: selectedStart === b.start ? "#00ff8722" : "transparent",
                border: `1px solid ${selectedStart === b.start ? "#00ff87" : "#333"}`,
                color: selectedStart === b.start ? "#00ff87" : "#888",
                padding: "6px 12px",
                borderRadius: 6,
                fontFamily: "'DM Mono', monospace",
                fontSize: 12,
                cursor: "pointer",
              }}
            >
              {b.label}
            </button>
          ))}
        </div>
      </div>

      {/* Selected period stats */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
          gap: 12,
          marginBottom: 22,
        }}
      >
        {[
          { label: "CAGR", value: fmtPct(selected.cagr), color: "#00ff87" },
          { label: "CUMULATIVE", value: fmtMult(selected.cumulative), color: "#00d4ff" },
          { label: "AVG ANNUAL", value: fmtPct(selected.avgAnnual), color: "#ffbe0b" },
          {
            label: "UP YEARS",
            value: `${positiveCount}/${duration}`,
            color: positiveCount >= Math.ceil(duration * 0.67) ? "#00ff87" : "#ff6b6b",
          },
        ].map((s) => (
          <div
            key={s.label}
            style={{
              background: "#0e0e18",
              border: "1px solid #1a1a28",
              borderRadius: 10,
              padding: "14px 16px",
            }}
          >
            <div style={{ fontSize: 11, color: "#666", letterSpacing: 1, marginBottom: 4 }}>
              {s.label}
            </div>
            <div style={{ fontSize: 18, color: s.color }}>{s.value}</div>
          </div>
        ))}
      </div>

      {/* Two histograms / charts side by side */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
          gap: 18,
        }}
      >
        {/* Annual returns bar chart (year by year) */}
        <div
          style={{
            background: "#0a0a14",
            border: "1px solid #15151f",
            borderRadius: 14,
            padding: 20,
          }}
        >
          <h2
            style={{
              fontFamily: "'Bebas Neue', sans-serif",
              fontSize: 14,
              letterSpacing: 3,
              color: "#888",
              margin: "0 0 6px",
            }}
          >
            ANNUAL RETURNS · {selected.start}–{selected.end}
          </h2>
          <p style={{ color: "#666", fontSize: 12, margin: "0 0 14px" }}>
            Year-by-year S&amp;P 500 total return in this window
          </p>
          <div style={{ width: "100%", height: 260 }}>
            <ResponsiveContainer>
              <BarChart data={annualBars} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
                <CartesianGrid stroke="#1a1a28" strokeDasharray="3 3" />
                <XAxis
                  dataKey="year"
                  stroke="#555"
                  tick={{ fill: "#666", fontSize: 10 }}
                  interval={Math.max(0, Math.floor(duration / 8) - 1)}
                />
                <YAxis
                  stroke="#555"
                  tick={{ fill: "#666", fontSize: 11 }}
                  tickFormatter={(v) => `${v}%`}
                />
                <Tooltip content={<ChartTooltip />} />
                <ReferenceLine y={0} stroke="#444" />
                <Bar dataKey="return" name="Return" radius={[2, 2, 0, 0]}>
                  {annualBars.map((d, i) => (
                    <Cell key={i} fill={d.return >= 0 ? "#00ff87" : "#ff6b6b"} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Distribution histogram */}
        <div
          style={{
            background: "#0a0a14",
            border: "1px solid #15151f",
            borderRadius: 14,
            padding: 20,
          }}
        >
          <h2
            style={{
              fontFamily: "'Bebas Neue', sans-serif",
              fontSize: 14,
              letterSpacing: 3,
              color: "#888",
              margin: "0 0 6px",
            }}
          >
            RETURN DISTRIBUTION · {selected.start}–{selected.end}
          </h2>
          <p style={{ color: "#666", fontSize: 12, margin: "0 0 14px" }}>
            How many years fell into each return bucket
          </p>
          <div style={{ width: "100%", height: 260 }}>
            <ResponsiveContainer>
              <BarChart data={bins} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
                <CartesianGrid stroke="#1a1a28" strokeDasharray="3 3" />
                <XAxis
                  dataKey="label"
                  stroke="#555"
                  tick={{ fill: "#666", fontSize: 10 }}
                  interval={0}
                  angle={-25}
                  textAnchor="end"
                  height={50}
                />
                <YAxis
                  stroke="#555"
                  tick={{ fill: "#666", fontSize: 11 }}
                  allowDecimals={false}
                />
                <Tooltip
                  content={({ active, payload }) => {
                    if (!active || !payload?.length) return null;
                    const d = payload[0].payload as { label: string; count: number };
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
                        <div style={{ color: "#888", marginBottom: 4 }}>{d.label}</div>
                        <div style={{ color: "#00ff87" }}>
                          {d.count} year{d.count !== 1 ? "s" : ""}
                        </div>
                      </div>
                    );
                  }}
                />
                <Bar dataKey="count" name="Years" radius={[3, 3, 0, 0]}>
                  {bins.map((b, i) => (
                    <Cell
                      key={i}
                      fill={b.hi <= 0 ? "#ff6b6b" : b.lo >= 20 ? "#00ff87" : "#00d4ff"}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
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
        Bitcoin (crypto) annual returns {MIN_YEAR}–{MAX_YEAR} · {duration}-year rolling windows · For
        illustrative purposes only · Not financial advice
      </p>
    </div>
  );
}
