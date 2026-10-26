import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip } from 'recharts'
import { EmptyState } from '../feedback/states'
export function ActivityChart({ data }: { data: { label: string; count: number }[] }) {
  if (!data.length)
    return (
      <div className="activity-placeholder">
        <EmptyState
          title="No activity to chart"
          description="Activity analytics will appear when reporting is connected."
        />
      </div>
    )
  return (
    <div className="activity-chart" role="img" aria-label="Activity counts by period">
      <ResponsiveContainer width="100%" height={240}>
        <BarChart data={data}>
          <XAxis
            dataKey="label"
            stroke="var(--muted-foreground)"
            tickLine={false}
            axisLine={false}
          />
          <YAxis
            allowDecimals={false}
            stroke="var(--muted-foreground)"
            tickLine={false}
            axisLine={false}
          />
          <Tooltip
            contentStyle={{
              background: 'var(--surface-raised)',
              borderColor: 'var(--border)',
              color: 'var(--foreground)',
              borderRadius: 12,
            }}
            cursor={{ fill: 'var(--secondary)' }}
          />
          <Bar dataKey="count" fill="var(--primary)" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
      <table className="sr-only">
        <caption>Activity counts</caption>
        <thead>
          <tr>
            <th>Period</th>
            <th>Count</th>
          </tr>
        </thead>
        <tbody>
          {data.map((item) => (
            <tr key={item.label}>
              <td>{item.label}</td>
              <td>{item.count}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
