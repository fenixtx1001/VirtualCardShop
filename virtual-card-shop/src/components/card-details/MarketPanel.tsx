"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import {
  dateLabel,
  grades,
  gradeLabel,
  graphCoordinates,
  money,
  requestJson,
  trendLabel,
  type GraphPoint,
  type Market,
  type MarketRange,
} from "@/lib/card-details/model";
function Chart({ points }: { points: GraphPoint[] }) {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(400);
  const [active, setActive] = useState<number | null>(null);
  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const observer = new ResizeObserver((entries) =>
      setWidth(Math.max(240, entries[0].contentRect.width)),
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  const graph = graphCoordinates(points, width, 205);
  if (graph.points.length < 2)
    return (
      <p className="cd-empty">
        A chart will appear after sales on at least two dates.
      </p>
    );
  const selected = active == null ? null : graph.points[active];
  return (
    <div ref={ref} className="cd-chart">
      <svg
        viewBox={`0 0 ${width} 205`}
        role="img"
        aria-label="Average sale value in US dollars by date. Exact values are available below."
      >
        {[graph.low, (graph.low + graph.high) / 2, graph.high].map(
          (value, i) => (
            <g key={i}>
              <line
                x1="64"
                x2={width - 18}
                y1={147 - i * 73.5 + 18}
                y2={147 - i * 73.5 + 18}
                className="cd-chart-grid"
              />
              <text x="55" y={169 - i * 73.5} textAnchor="end">
                {money(value)}
              </text>
            </g>
          ),
        )}
        <polyline
          points={graph.points.map((p) => `${p.x},${p.y}`).join(" ")}
          fill="none"
          className="cd-chart-line"
        />
        {graph.points.map((p, i) => (
          <circle
            key={p.date}
            cx={p.x}
            cy={p.y}
            r={i === active ? 5 : 3}
            className="cd-chart-dot"
          />
        ))}
        <text x="64" y="194">
          {dateLabel(graph.points[0].date)}
        </text>
        <text x={width - 18} y="194" textAnchor="end">
          {dateLabel(graph.points.at(-1)!.date)}
        </text>
        <rect
          x="64"
          y="10"
          width={width - 82}
          height="165"
          fill="transparent"
          onPointerMove={(event) => {
            const box =
              event.currentTarget.ownerSVGElement!.getBoundingClientRect();
            const x = ((event.clientX - box.left) * width) / box.width;
            const index = graph.points.reduce(
              (best, p, i) =>
                Math.abs(p.x - x) < Math.abs(graph.points[best].x - x)
                  ? i
                  : best,
              0,
            );
            setActive(index);
          }}
          onPointerLeave={() => setActive(null)}
        />
      </svg>
      <div className="cd-chart-caption">
        {selected
          ? `${dateLabel(selected.date)} · ${money(selected.averageSaleCents)} · ${selected.salesCount} sales`
          : "Daily average · VCS transactions · USD"}
      </div>
      <details className="cd-disclosure">
        <summary>View chart data</summary>
        <table className="cd-table">
          <thead>
            <tr>
              <th>Date</th>
              <th>Sales</th>
              <th>Average</th>
            </tr>
          </thead>
          <tbody>
            {graph.points.map((p) => (
              <tr key={p.date}>
                <td>{dateLabel(p.date)}</td>
                <td>{p.salesCount}</td>
                <td>{money(p.averageSaleCents)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </div>
  );
}
export default function MarketPanel({
  cardId,
  initialGrade,
}: {
  cardId: number;
  initialGrade: number;
}) {
  const [grade, setGrade] = useState(initialGrade);
  const [range, setRange] = useState<MarketRange>("ALL");
  const [data, setData] = useState<Market | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    const abort = new AbortController();
    setLoading(true);
    setError("");
    requestJson<Market>(`/api/cards/${cardId}/market?range=${range}`, {
      signal: abort.signal,
    })
      .then(setData)
      .catch((e) => {
        if (!abort.signal.aborted) setError(e.message);
      })
      .finally(() => {
        if (!abort.signal.aborted) setLoading(false);
      });
    return () => abort.abort();
  }, [cardId, range, retry]);
  const row = data?.grades.find((r) => r.grade === grade);
  return (
    <section aria-label="Market history">
      <div className="cd-section-heading">
        <div>
          <h2>Market activity</h2>
          <p>Completed VCS sales. Book values are separate.</p>
        </div>
      </div>
      <div className="cd-market-controls">
        <label>
          Grade
          <select
            value={grade}
            onChange={(e) => setGrade(Number(e.target.value))}
          >
            {grades.map((g) => (
              <option key={g} value={g}>
                {gradeLabel(g)}
              </option>
            ))}
          </select>
        </label>
        <div
          className="cd-segmented"
          role="group"
          aria-label="Sales date range"
        >
          {(["7D", "30D", "90D", "ALL"] as const).map((r) => (
            <button
              key={r}
              aria-pressed={r === range}
              onClick={() => setRange(r)}
            >
              {r === "ALL" ? "All" : r}
            </button>
          ))}
        </div>
      </div>
      {loading ? (
        <p className="cd-empty" role="status">
          Loading sales…
        </p>
      ) : error ? (
        <div className="cd-message" role="alert">
          {error}
          <button onClick={() => setRetry((r) => r + 1)}>Retry</button>
        </div>
      ) : !row?.salesCount ? (
        <div className="cd-empty">
          <h3>No {gradeLabel(grade).toLowerCase()} sales yet</h3>
          <p>
            {range === "ALL"
              ? "Completed sales will appear here."
              : "No sales in this range. Try All to see earlier activity."}
          </p>
        </div>
      ) : (
        <>
          <div className="cd-metrics">
            <div>
              <span>Last sale</span>
              <strong>{money(row.lastSaleCents)}</strong>
              <small>{row.lastSaleAt && dateLabel(row.lastSaleAt)}</small>
            </div>
            <div>
              <span>Average</span>
              <strong>{money(row.averageSaleCents)}</strong>
              <small>
                {range === "ALL"
                  ? "All recorded sales"
                  : `Past ${range.slice(0, -1)} days`}
              </small>
            </div>
            <div>
              <span>Sales</span>
              <strong>{row.salesCount}</strong>
              <small>{gradeLabel(grade)}</small>
            </div>
          </div>
          <Chart points={row.graphData} />
          <details className="cd-disclosure">
            <summary>High, low & movement</summary>
            <dl className="cd-facts">
              <div>
                <dt>High sale</dt>
                <dd>{money(row.highestSaleCents)}</dd>
              </div>
              <div>
                <dt>Low sale</dt>
                <dd>{money(row.lowestSaleCents)}</dd>
              </div>
              <div>
                <dt>Movement</dt>
                <dd>{trendLabel(row)}</dd>
              </div>
            </dl>
            <p className="cd-muted">
              Movement compares the newer half of transactions with the older
              half. At least four sales are required.
            </p>
          </details>
          <h3 className="cd-subheading">Recent sales</h3>
          <div className="cd-sales">
            {row.recentSales.map((s) => (
              <div key={s.id}>
                <div>
                  <strong>{money(s.salePriceCents)}</strong>
                  <span>
                    {dateLabel(s.createdAt)} ·{" "}
                    {s.saleType === "SHOP"
                      ? "Shop sale"
                      : s.buyerType === "DUMMY"
                        ? "Auction · VCS buyer"
                        : "Auction · Collector"}
                  </span>
                </div>
                {s.auctionId ? (
                  <Link href={`/auctions/${s.auctionId}`}>View auction ↗</Link>
                ) : (
                  <span>{s.label}</span>
                )}
              </div>
            ))}
          </div>
        </>
      )}
    </section>
  );
}
