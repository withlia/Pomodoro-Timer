type Props = {
  page: number
  pageCount: number
  setPage: (page: number) => void
}

export function Pagination({ page, pageCount, setPage }: Props) {
  if (pageCount <= 1) return null
  const safePage = Math.min(Math.max(1, page), pageCount)

  return (
    <div className="pagination">
      <button
        type="button"
        className="pagination-btn"
        disabled={safePage <= 1}
        onClick={() => setPage(safePage - 1)}
      >
        上一页
      </button>
      <span className="pagination-info">
        <strong>{safePage}</strong> / {pageCount}
      </span>
      <button
        type="button"
        className="pagination-btn"
        disabled={safePage >= pageCount}
        onClick={() => setPage(safePage + 1)}
      >
        下一页
      </button>
    </div>
  )
}
