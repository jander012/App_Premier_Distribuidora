export function CategoryStrip({ categories, value, onChange, allValue = 'all', allLabel = 'Todos' }) {
  return (
    <div className="category-strip-wrap">
      <div
        className="category-strip"
        role="tablist"
        aria-label="Filtrar por categoria"
      >
        <button
          type="button"
          role="tab"
          aria-selected={value === allValue}
          className={`category-pill${value === allValue ? ' category-pill--active' : ''}`}
          style={{ '--category-bg': '#fbbc23' }}
          onClick={() => onChange(allValue)}
        >
          <span className="category-pill__visual" aria-hidden>
            <span className="category-pill__fallback">T</span>
          </span>
          <span className="category-pill__label">{allLabel}</span>
        </button>
        {categories.map((cat) => {
          const bg = cat.background_color || cat.backgroundColor || '#f8d7dd';
          const image = cat.image_url || cat.imageUrl || '';
          return (
            <button
              key={cat.id}
              type="button"
              role="tab"
              aria-selected={value === cat.id}
              className={`category-pill${value === cat.id ? ' category-pill--active' : ''}`}
              style={{ '--category-bg': bg }}
              onClick={() => onChange(cat.id)}
            >
              <span className="category-pill__visual" aria-hidden>
                {image ? (
                  <img src={image} alt="" loading="lazy" />
                ) : (
                  <span className="category-pill__fallback">{String(cat.name || '?').slice(0, 1)}</span>
                )}
              </span>
              <span className="category-pill__label">{cat.name}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
