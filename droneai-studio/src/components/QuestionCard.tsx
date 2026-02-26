import { useState } from "react";
import type { QuestionData } from "../lib/droneaiBlocks";

interface QuestionCardProps {
  data: QuestionData;
  onSelect: (id: string, label: string) => void;
  disabled?: boolean;
}

export default function QuestionCard({ data, onSelect, disabled }: QuestionCardProps) {
  const [selected, setSelected] = useState<string | null>(null);

  const handleClick = (id: string, label: string) => {
    if (disabled || selected) return;
    setSelected(id);
    onSelect(id, label);
  };

  return (
    <div className="droneai-card">
      <p className="droneai-card-text">{data.text}</p>
      <div className="droneai-options">
        {data.options.map((opt) => (
          <button
            key={opt.id}
            onClick={() => handleClick(opt.id, opt.label)}
            disabled={disabled || !!selected}
            className={`droneai-option ${
              selected === opt.id ? "selected" : ""
            } ${selected && selected !== opt.id ? "dimmed" : ""}`}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  );
}
