import type { ErrorData } from "../lib/droneaiBlocks";

interface ErrorCardProps {
  data: ErrorData;
}

export default function ErrorCard({ data }: ErrorCardProps) {
  return (
    <div className="droneai-error">
      <div className="droneai-error-icon">!</div>
      <div>
        <p className="droneai-error-message">{data.message}</p>
        {data.suggestion && (
          <p className="droneai-error-suggestion">{data.suggestion}</p>
        )}
      </div>
    </div>
  );
}
