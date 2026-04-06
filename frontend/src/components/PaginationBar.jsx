import { ChevronLeft, ChevronRight } from 'lucide-react';

export default function PaginationBar({ page, total, limit, onPageChange }) {
  const pages = Math.max(1, Math.ceil(total / limit));
  return (
    <div className="pagination">
      <button
        type="button"
        className="btn-icon"
        disabled={page <= 1}
        onClick={() => onPageChange(page - 1)}
        aria-label="Halaman sebelumnya"
      >
        <ChevronLeft size={22} strokeWidth={2} />
      </button>
      <span className="muted px-2 font-medium">
        {page} / {pages} · {total} data
      </span>
      <button
        type="button"
        className="btn-icon"
        disabled={page >= pages}
        onClick={() => onPageChange(page + 1)}
        aria-label="Halaman berikutnya"
      >
        <ChevronRight size={22} strokeWidth={2} />
      </button>
    </div>
  );
}
