import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { stockApi, dataApi } from '../api'
import { formatPrice, formatPct, changeColor } from '../utils/format'

function StockRow({ stock }) {
  const { data } = useQuery({
    queryKey: ['prices', stock.ticker, 2],
    queryFn: () => stockApi.prices(stock.ticker, 2).then((r) => r.data),
  })
  const latest = data && data.length ? data[data.length - 1] : null

  return (
    <Link to={`/stock/${stock.ticker}`} className="card row">
      <div>
        <div className="row-name">{stock.name}</div>
        <div className="row-sub">
          {stock.ticker} · <span className="tag">{stock.type}</span>
          {stock.theme ? ` · ${stock.theme}` : ''}
        </div>
      </div>
      <div className="row-right">
        <div className="row-price">{latest ? formatPrice(latest.close_price) : '-'}</div>
        {latest && (
          <div style={{ color: changeColor(latest.change_pct) }}>
            {formatPct(latest.change_pct)}
          </div>
        )}
      </div>
    </Link>
  )
}

export default function Dashboard() {
  const queryClient = useQueryClient()
  const { data: stocks, isLoading } = useQuery({
    queryKey: ['stocks'],
    queryFn: () => stockApi.list().then((r) => r.data),
  })
  const { data: stats } = useQuery({
    queryKey: ['stats'],
    queryFn: () => dataApi.stats().then((r) => r.data),
  })

  const collect = useMutation({
    mutationFn: () => dataApi.collectAll().then((r) => r.data),
    onSuccess: () => queryClient.invalidateQueries(),
  })

  return (
    <div className="container">
      <header className="page-head">
        <div>
          <h1>K-Growth Insights</h1>
          <p className="muted">한국 고성장 섹터 ETF·주식 · 네이버 모바일 API 기반</p>
        </div>
        <button
          className="btn"
          onClick={() => collect.mutate()}
          disabled={collect.isPending}
        >
          {collect.isPending ? '수집 중…' : '전체 데이터 수집'}
        </button>
      </header>

      {stats && (
        <p className="muted stats">
          종목 {stats.stocks.toLocaleString()} · 시세 {stats.prices.toLocaleString()} · 매매동향{' '}
          {stats.trading_flow.toLocaleString()} · 분봉 {stats.intraday_prices.toLocaleString()}
        </p>
      )}

      {isLoading ? (
        <p>불러오는 중…</p>
      ) : (
        <div className="list">
          {(stocks || []).map((s) => (
            <StockRow key={s.ticker} stock={s} />
          ))}
        </div>
      )}
    </div>
  )
}
