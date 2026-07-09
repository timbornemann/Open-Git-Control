import React from 'react';

type AiOptionToggleProps = {
  label: string;
  description: string;
  checked: boolean;
  disabled: boolean;
  onChange: (next: boolean) => void;
};

export const AiOptionToggle: React.FC<AiOptionToggleProps> = ({ label, description, checked, disabled, onChange }) => (
  <label className={`release-ai-option ${disabled ? 'release-ai-option--disabled' : ''}`}>
    <span className="release-ai-option-text">
      <strong>{label}</strong>
      <small>{description}</small>
    </span>
    <span className="release-switch">
      <input type="checkbox" className="release-switch-input" checked={checked} onChange={(event) => onChange(event.target.checked)} disabled={disabled} />
      <span className="release-switch-track">
        <span className="release-switch-thumb" />
      </span>
    </span>
  </label>
);
