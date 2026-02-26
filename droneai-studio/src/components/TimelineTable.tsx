import type { TimelineData } from "../lib/droneaiBlocks";

interface TimelineTableProps {
  data: TimelineData;
}

export default function TimelineTable({ data }: TimelineTableProps) {
  return (
    <table className="droneai-timeline">
      <thead>
        <tr>
          <th>Time</th>
          <th>Formation</th>
          <th>Color</th>
        </tr>
      </thead>
      <tbody>
        {data.rows.map((row, i) => (
          <tr key={i}>
            <td>{row.time}</td>
            <td>{row.formation}</td>
            <td>{row.color}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
