import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { stockApi, dataApi } from '../api'
import { formatPrice, formatPct, changeColor } from '../utils/format'

// 종목 한 줄. 최신 종가·등락률은 summary 배치 응답에 이미 포함되어 있어
// 행마다 별도 요청을 하지 않는다.
function StockRow({ stock }) {
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
        <div className="row-price">{formatPrice(stock.close_price)}</div>
        {stock.change_pct != null && (
          <div style={{ color: changeColor(stock.change_pct) }}>
            {formatPct(stock.change_pct)}
          </div>
        )}
      </div>
    </Link>
  )
}

export default function Dashboard() {
  const queryClient = useQueryClient()

  // 종목 목록 + 최신가를 한 번의 요청으로 조회 (N+1 제거).
  const { data: stocks, isLoading } = useQuery({
    queryKey: ['stocks-summary'],
    queryFn: () => stockApi.summary().then((r) => r.data),
  })
  const { data: stats } = useQuery({
    queryKey: ['stats'],
    queryFn: () => dataApi.stats().then((r) => r.data),
  })

  // 전체 수집 후 모든 쿼리를 무효화해 화면을 최신화한다.
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
        <button className="btn" onClick={() => collect.mutate()} disabled={collect.isPending}>
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
