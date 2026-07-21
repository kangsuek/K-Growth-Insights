import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Link, useParams } from 'react-router-dom'
import { stockApi, dataApi } from '../api'
import PriceChart from '../components/PriceChart'
import TradingFlowChart from '../components/TradingFlowChart'
import IntradayChart from '../components/IntradayChart'
import { formatPrice, formatPct, formatSigned, changeColor } from '../utils/format'

export default function StockDetail() {
  const { ticker } = useParams()
  const queryClient = useQueryClient()

  const { data: stock } = useQuery({
    queryKey: ['stock', ticker],
    queryFn: () => stockApi.detail(ticker).then((r) => r.data),
  })
  const { data: prices } = useQuery({
    queryKey: ['prices', ticker, 60],
    queryFn: () => stockApi.prices(ticker, 60).then((r) => r.data),
  })
  const { data: flow } = useQuery({
    queryKey: ['flow', ticker, 20],
    queryFn: () => stockApi.tradingFlow(ticker, 20).then((r) => r.data),
  })
  const { data: intraday } = useQuery({
    queryKey: ['intraday', ticker],
    queryFn: () => stockApi.intraday(ticker).then((r) => r.data),
  })

  const collect = useMutation({
    mutationFn: () => dataApi.collectOne(ticker).then((r) => r.data),
    onSuccess: () => queryClient.invalidateQueries(),
  })

  const latest = prices && prices.length ? prices[prices.length - 1] : null
  const recentFlow = flow && flow.length ? flow[flow.length - 1] : null

  return (
    <div className="container">
      <div className="detail-head">
        <Link to="/" className="back">← 목록</Link>
        <button className="btn sm" onClick={() => collect.mutate()} disabled={collect.isPending}>
          {collect.isPending ? '수집 중…' : '새로고침'}
        </button>
      </div>

      <header className="stock-head">
        <h1>
          {stock ? stock.name : ticker}{' '}
          <span className="tag">{stock?.type}</span>
        </h1>
        <div className="muted">
          {ticker}
          {stock?.theme ? ` · ${stock.theme}` : ''}
        </div>
        {latest && (
          <div className="price-line">
            <span className="big">{formatPrice(latest.close_price)}</span>
            <span style={{ color: changeColor(latest.change_pct) }}>
              {formatPct(latest.change_pct)}
            </span>
          </div>
        )}
      </header>

      <section className="card">
        <h2>가격 흐름 (최근 60거래일)</h2>
        <PriceChart data={prices} />
      </section>

      <section className="card">
        <h2>투자자별 매매동향 (최근 20거래일)</h2>
        {recentFlow && (
          <p className="muted">
            최근일 외국인 {formatSigned(recentFlow.foreign_net)} · 기관{' '}
            {formatSigned(recentFlow.institutional_net)} · 개인{' '}
            {formatSigned(recentFlow.individual_net)}
            {recentFlow.foreign_hold_ratio != null &&
              ` · 외국인 보유율 ${recentFlow.foreign_hold_ratio}%`}
          </p>
        )}
        <TradingFlowChart data={flow} />
      </section>

      <section className="card">
        <h2>오늘의 체결 흐름 (분봉)</h2>
        <IntradayChart data={intraday} />
      </section>
    </div>
  )
}
