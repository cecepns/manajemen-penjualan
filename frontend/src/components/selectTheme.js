/** Gaya react-select — selaras palet Tailwind (slate / blue) */
export function selectStyles() {
  return {
    control: (base, state) => ({
      ...base,
      background: '#ffffff',
      borderColor: state.isFocused ? '#2563eb' : '#cbd5e1',
      minHeight: 44,
      boxShadow: state.isFocused ? '0 0 0 2px rgba(37, 99, 235, 0.2)' : 'none',
      '&:hover': { borderColor: '#94a3b8' },
    }),
    menu: (base) => ({
      ...base,
      background: '#ffffff',
      border: '1px solid #e2e8f0',
      borderRadius: 10,
      boxShadow: '0 8px 24px rgba(15, 23, 42, 0.1)',
      zIndex: 100,
    }),
    option: (base, state) => ({
      ...base,
      background: state.isFocused ? '#f1f5f9' : '#ffffff',
      color: '#0f172a',
      cursor: 'pointer',
    }),
    singleValue: (base) => ({ ...base, color: '#0f172a' }),
    input: (base) => ({ ...base, color: '#0f172a' }),
    placeholder: (base) => ({ ...base, color: '#94a3b8' }),
    indicatorSeparator: () => ({ display: 'none' }),
    dropdownIndicator: (base) => ({ ...base, color: '#64748b' }),
  };
}
