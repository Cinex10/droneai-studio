import { useState } from "react";
import type { SelectData } from "../lib/droneaiBlocks";

interface SelectCardProps {
  data: SelectData;
  onSelect: (ids: string[], labels: string[]) => void;
  disabled?: boolean;
}

export default function SelectCard({ data, onSelect, disabled }: SelectCardProps) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirmed, setConfirmed] = useState(false);

  const toggle = (id: string) => {
    if (confirmed || disabled) return;
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelected(next);
  };

  const handleConfirm = () => {
    if (selected.size === 0) return;
    setConfirmed(true);
    const ids = Array.from(selected);
    const labels = ids.map(
      (id) => data.options.find((o) => o.id === id)?.label ?? id
    );
    onSelect(ids, labels);
  };

  return (
    <div className="droneai-card">
      <p className="droneai-card-text">{data.text}</p>
      <div className="droneai-options">
        {data.options.map((opt) => (
          <button
            key={opt.id}
            onClick={() => toggle(opt.id)}
            disabled={disabled || confirmed}
            className={`droneai-option ${selected.has(opt.id) ? "selected" : ""} ${
              confirmed && !selected.has(opt.id) ? "dimmed" : ""
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>
      {!confirmed && (
        <button
          onClick={handleConfirm}
          disabled={selected.size === 0}
          className="droneai-confirm"
        >
          Continue
        </button>
      )}
    </div>
  );
}
