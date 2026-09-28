/** Stable page-sized structure for a genuinely cold resource. Cached content
 * stays mounted while fetching; this is never used for a background refresh. */
export function DataPlaceholder({ rows = 5 }: { rows?: number }) {
  return (
    <div className="data-placeholder" aria-busy="true" aria-label="Loading" role="status">
      {Array.from({ length: rows }, (_, index) => (
        <div className="data-placeholder__row" key={index} />
      ))}
    </div>
  );
}
