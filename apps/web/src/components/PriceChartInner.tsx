import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

import { formatNumber } from '../lib/format';
import type { ChartProps } from './PriceChart';

/**
 * The Recharts body, split out so the library is only in this chunk. Keeping
 * it in its own module is what makes the dynamic import in PriceChart
 * actually remove it from the page's initial payload (spec §10.6).
 */
export default function PriceChartInner({ points }: ChartProps) {
  if (points.length === 0) {
    return <p className="mt-4 text-earth-600">No hay datos para esta calidad.</p>;
  }

  return (
    // Fixed height so the chart cannot cause layout shift while it renders.
    <div className="mt-4" style={{ width: '100%', height: 260 }}>
      <ResponsiveContainer>
        <LineChart data={points} margin={{ top: 8, right: 8, bottom: 8, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e7e0d4" />
          <XAxis dataKey="week" tick={{ fontSize: 12 }} interval="preserveStartEnd" />
          <YAxis
            tick={{ fontSize: 12 }}
            width={56}
            tickFormatter={(value: number) => `${value.toFixed(2)} €`}
            domain={['dataMin - 0.1', 'dataMax + 0.1']}
          />
          <Tooltip
            // Recharts types this callback loosely; coerce so it cannot
            // stringify an object into "[object Object]".
            formatter={(value) => [`${Number(value).toFixed(4)} €/kg`, 'Precio']}
            // Recharts types the label as ReactNode. Narrow it to a primitive
            // before stringifying, or an object renders "[object Object]".
            labelFormatter={(label) =>
              `Semana del ${typeof label === 'string' || typeof label === 'number' ? label : ''}`
            }
          />
          <Line
            type="monotone"
            dataKey="eurKg"
            stroke="#3f6212"
            strokeWidth={2.5}
            dot={{ r: 3 }}
            name={`Precio (${formatNumber(points.length)} semanas)`}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
