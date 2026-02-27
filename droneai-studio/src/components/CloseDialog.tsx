interface CloseDialogProps {
  onSave: () => void;
  onDiscard: () => void;
  onCancel: () => void;
}

export default function CloseDialog({
  onSave,
  onDiscard,
  onCancel,
}: CloseDialogProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-[var(--bg-secondary)] border border-[var(--border)] rounded-xl p-6 max-w-sm w-full shadow-2xl">
        <h2 className="text-base font-semibold text-[var(--text-primary)] mb-2">
          Unsaved Changes
        </h2>
        <p className="text-sm text-[var(--text-secondary)] mb-6 leading-relaxed">
          You have unsaved changes. What would you like to do?
        </p>
        <div className="flex gap-2 justify-end">
          <button
            onClick={onCancel}
            className="px-4 py-2 text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={onDiscard}
            className="px-4 py-2 text-sm text-red-400 hover:text-red-300 transition-colors"
          >
            Discard
          </button>
          <button
            onClick={onSave}
            className="px-4 py-2 text-sm bg-[var(--accent)] text-white rounded-lg hover:bg-[var(--accent-hover)] transition-colors"
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
