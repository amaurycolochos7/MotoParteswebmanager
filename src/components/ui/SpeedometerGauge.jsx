export default function SpeedometerGauge({ value, label }) {
    // Clamp value between 0-100
    const clampedValue = Math.max(0, Math.min(100, value));

    // Calculate color based on progress
    const getColor = () => {
        if (clampedValue >= 80) return 'var(--success)';
        if (clampedValue >= 50) return 'var(--primary)';
        if (clampedValue >= 25) return 'var(--warning)';
        return 'var(--danger)';
    };

    const color = getColor();
    const progressWidth = `${clampedValue}%`;

    return (
        <div className="gauge-container">
            <div className="gauge-bar">
                <div
                    className="gauge-fill"
                    style={{
                        width: progressWidth,
                        background: color
                    }}
                />
            </div>
            <div className="gauge-label" style={{ color }}>
                {label}
            </div>

            <style>{`
        .gauge-container {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: var(--spacing-sm);
          padding: var(--spacing-md) 0;
        }

        .gauge-bar {
          width: 100%;
          height: 8px;
          background: var(--bg-tertiary);
          border-radius: var(--radius-full);
          overflow: hidden;
        }

        .gauge-fill {
          height: 100%;
          border-radius: var(--radius-full);
          transition: width 0.5s ease, background 0.3s ease;
        }

        .gauge-label {
          font-size: 1.5rem;
          font-weight: 700;
        }
      `}</style>
        </div>
    );
}
