import { useState, useEffect, useRef } from 'react';

export default function Tooltip({ text }) {
  const [open, setOpen] = useState(false);
  const timerRef = useRef(null);
  const containerRef = useRef(null);

  function handleMouseEnter() {
    timerRef.current = setTimeout(() => setOpen(true), 300);
  }

  function handleMouseLeave() {
    clearTimeout(timerRef.current);
    setOpen(false);
  }

  function handleClick(e) {
    e.stopPropagation();
    setOpen(o => !o);
  }

  useEffect(() => {
    if (!open) return;
    function handleDocClick(e) {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setOpen(false);
      }
    }
    document.addEventListener('click', handleDocClick);
    return () => document.removeEventListener('click', handleDocClick);
  }, [open]);

  useEffect(() => {
    return () => clearTimeout(timerRef.current);
  }, []);

  return (
    <span
      ref={containerRef}
      style={{ position: 'relative', display: 'inline-block', verticalAlign: 'middle', marginLeft: 4 }}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <button
        onClick={handleClick}
        style={{
          width: 14,
          height: 14,
          borderRadius: '50%',
          background: 'rgba(0,200,255,0.18)',
          border: '1px solid rgba(0,200,255,0.35)',
          color: '#00c8ff',
          fontSize: 9,
          fontWeight: 700,
          lineHeight: 1,
          cursor: 'pointer',
          padding: 0,
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
          fontFamily: 'sans-serif',
        }}
        aria-label="Help"
        type="button"
      >
        ?
      </button>
      {open && (
        <div
          style={{
            position: 'absolute',
            bottom: '100%',
            left: '50%',
            transform: 'translateX(-50%)',
            marginBottom: 6,
            background: 'rgba(10,20,40,0.95)',
            color: '#d0e4f4',
            fontSize: 12,
            lineHeight: 1.5,
            padding: '8px 10px',
            borderRadius: 6,
            maxWidth: 220,
            width: 'max-content',
            zIndex: 9999,
            border: '1px solid rgba(0,200,255,0.2)',
            pointerEvents: 'none',
            whiteSpace: 'normal',
            textAlign: 'left',
            fontFamily: "'Rajdhani', sans-serif",
            fontWeight: 500,
          }}
        >
          {text}
          <div
            style={{
              position: 'absolute',
              top: '100%',
              left: '50%',
              transform: 'translateX(-50%)',
              width: 0,
              height: 0,
              borderLeft: '5px solid transparent',
              borderRight: '5px solid transparent',
              borderTop: '5px solid rgba(10,20,40,0.95)',
            }}
          />
        </div>
      )}
    </span>
  );
}
