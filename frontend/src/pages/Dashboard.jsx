import { useEffect, useRef } from 'react'
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

  // 전체 수집은 백그라운드로 실행되며 진행 상태를 폴링한다.
  const { data: job } = useQuery({
    queryKey: ['collect-status'],
    queryFn: () => dataApi.collectStatus().then((r) => r.data),
    // 수집 중일 때만 1초 간격 폴링, 그 외에는 중단.
    refetchInterval: (query) => (query.state.data?.status === 'running' ? 1000 : false),
  })
  const running = job?.status === 'running'

  const collect = useMutation({
    mutationFn: () => dataApi.collectAll().then((r) => r.data),
    // 시작 직후부터 폴링이 돌도록 상태 쿼리를 즉시 무효화.
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['collect-status'] }),
  })

  // 수집이 끝나는 순간(running → done) 화면 데이터 쿼리를 최신화한다.
  const prevStatus = useRef(job?.status)
  useEffect(() => {
    if (prevStatus.current === 'running' && job?.status === 'done') {
      queryClient.invalidateQueries({ queryKey: ['stocks-summary'] })
      queryClient.invalidateQueries({ queryKey: ['stats'] })
    }
    prevStatus.current = job?.status
  }, [job?.status, queryClient])

  const pct = job && job.total ? Math.round((job.completed / job.total) * 100) : 0

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
          disabled={running || collect.isPending}
        >
          {running ? (
            <>
              <span className="spinner" /> 수집 중… {job.completed}/{job.total}
            </>
          ) : (
            '전체 데이터 수집'
          )}
        </button>
      </header>

      {running && (
        <div className="progress" role="progressbar" aria-valuenow={pct}>
          <div className="progress-bar" style={{ width: `${pct}%` }} />
        </div>
      )}
      {job?.status === 'error' && (
        <p className="error-text">수집 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.</p>
      )}

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
