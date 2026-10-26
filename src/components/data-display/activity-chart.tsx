import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip } from 'recharts'
import { EmptyState } from '../feedback/states'
export function ActivityChart({ data }: { data: { label: string; count: number }[] }) {
  if (!data.length)
    return (
      <EmptyState
        title="No activity to chart"
        description="Activity analytics will appear when reporting is connected."
      />
    )
  return (
    <div className="activity-chart" role="img" aria-label="Activity counts by period">
      <ResponsiveContainer width="100%" height={240}>
        <BarChart data={data}>
          <XAxis dataKey="label" />
          <YAxis allowDecimals={false} />
          <Tooltip />
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
