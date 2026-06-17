import { useCallback, useEffect, useRef, useState } from 'react';

const DRAG_THRESHOLD_PX = 8;

/**
 * Faixa horizontal de categorias com scroll por toque, arraste, setas e roda do mouse.
 */
export function CategoryStrip({ categories, value, onChange, allValue = 'all', allLabel = 'Todos' }) {
  const stripRef = useRef(null);
  const dragRef = useRef({ active: false, startX: 0, scrollLeft: 0, dragged: false });
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  const updateScrollHints = useCallback(() => {
    const el = stripRef.current;
    if (!el) return;
    const max = el.scrollWidth - el.clientWidth;
    setCanScrollLeft(el.scrollLeft > 4);
    setCanScrollRight(max > 4 && el.scrollLeft < max - 4);
  }, []);

  useEffect(() => {
    const el = stripRef.current;
    if (!el) return;
    updateScrollHints();
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(updateScrollHints) : null;
    ro?.observe(el);
    el.addEventListener('scroll', updateScrollHints, { passive: true });
    window.addEventListener('resize', updateScrollHints);
    return () => {
      ro?.disconnect();
      el.removeEventListener('scroll', updateScrollHints);
      window.removeEventListener('resize', updateScrollHints);
    };
  }, [categories, updateScrollHints]);

  useEffect(() => {
    const el = stripRef.current;
    if (!el) return;
    const active = el.querySelector('.category-pill--active');
    if (active) {
      active.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' });
    }
    const t = window.setTimeout(updateScrollHints, 320);
    return () => window.clearTimeout(t);
  }, [value, categories, updateScrollHints]);

  const scrollBy = (direction) => {
    const el = stripRef.current;
    if (!el) return;
    const step = Math.max(200, Math.round(el.clientWidth * 0.72));
    el.scrollBy({ left: direction * step, behavior: 'smooth' });
  };

  const onPointerDown = (e) => {
    if (e.pointerType !== 'mouse' || e.button !== 0) return;
    if (e.target.closest('.category-pill')) return;

    const el = stripRef.current;
    if (!el) return;
    dragRef.current = { active: true, startX: e.clientX, scrollLeft: el.scrollLeft, dragged: false };
  };

  const onPointerMove = (e) => {
    if (!dragRef.current.active) return;
    const el = stripRef.current;
    if (!el) return;

    const dx = e.clientX - dragRef.current.startX;
    if (!dragRef.current.dragged) {
      if (Math.abs(dx) < DRAG_THRESHOLD_PX) return;
      dragRef.current.dragged = true;
      el.classList.add('category-strip--dragging');
      el.setPointerCapture(e.pointerId);
    }

    el.scrollLeft = dragRef.current.scrollLeft - dx;
  };

  const endDrag = (e) => {
    const el = stripRef.current;
    if (!dragRef.current.active) return;

    const wasDragged = dragRef.current.dragged;
    dragRef.current.active = false;
    dragRef.current.dragged = false;

    if (el) {
      el.classList.remove('category-strip--dragging');
      if (wasDragged) {
        try {
          el.releasePointerCapture(e.pointerId);
        } catch {
          // ignore
        }
      }
    }
  };

  const onWheel = (e) => {
    const el = e.currentTarget;
    if (Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return;
    el.scrollLeft += e.deltaY;
    e.preventDefault();
  };

  const wrapClass = [
    'category-strip-wrap',
    canScrollLeft ? 'category-strip-wrap--left' : '',
    canScrollRight ? 'category-strip-wrap--right' : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div className={wrapClass}>
      <button
        type="button"
        className="category-strip__nav category-strip__nav--prev"
        aria-label="Ver categorias anteriores"
        disabled={!canScrollLeft}
        onClick={() => scrollBy(-1)}
      />
      <div
        ref={stripRef}
        className="category-strip"
        role="tablist"
        aria-label="Filtrar por categoria"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerLeave={endDrag}
        onPointerCancel={endDrag}
        onWheel={onWheel}
      >
        <button
          type="button"
          role="tab"
          aria-selected={value === allValue}
          className={`category-pill${value === allValue ? ' category-pill--active' : ''}`}
          onClick={() => onChange(allValue)}
        >
          {allLabel}
        </button>
        {categories.map((cat) => (
          <button
            key={cat.id}
            type="button"
            role="tab"
            aria-selected={value === cat.id}
            className={`category-pill${value === cat.id ? ' category-pill--active' : ''}`}
            onClick={() => onChange(cat.id)}
          >
            {cat.name}
          </button>
        ))}
      </div>
      <button
        type="button"
        className="category-strip__nav category-strip__nav--next"
        aria-label="Ver próximas categorias"
        disabled={!canScrollRight}
        onClick={() => scrollBy(1)}
      />
    </div>
  );
}
