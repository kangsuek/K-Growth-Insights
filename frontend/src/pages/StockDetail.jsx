import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Link, useParams } from 'react-router-dom'
import { stockApi, dataApi } from '../api'
import PriceChart from '../components/PriceChart'
import TradingFlowChart from '../components/TradingFlowChart'
import IntradayChart from '../components/IntradayChart'
import FundamentalsCard from '../components/FundamentalsCard'
import NewsTimeline from '../components/NewsTimeline'
import InsightsCard from '../components/InsightsCard'
import { formatPrice, formatPct, formatSigned, changeColor } from '../utils/format'

// 차트 섹션의 로딩/에러 상태를 일관되게 처리한다.
function ChartState({ query, children }) {
  if (query.isLoading) {
    return (
      <div className="empty">
        <span className="spinner" /> 불러오는 중…
      </div>
    )
  }
  if (query.isError) {
    return (
      <div className="error-text">
        데이터를 불러오지 못했습니다.{' '}
        <button className="link-btn" onClick={() => query.refetch()}>
          다시 시도
        </button>
      </div>
    )
  }
  return children
}

export default function StockDetail() {
  const { ticker } = useParams()
  const queryClient = useQueryClient()

  // 상세 데이터 조회 (종목/시세/매매동향/분봉/펀더멘털/뉴스/인사이트).
  const stockQ = useQuery({
    queryKey: ['stock', ticker],
    queryFn: () => stockApi.detail(ticker).then((r) => r.data),
  })
  const pricesQ = useQuery({
    queryKey: ['prices', ticker, 60],
    queryFn: () => stockApi.prices(ticker, 60).then((r) => r.data),
  })
  const flowQ = useQuery({
    queryKey: ['flow', ticker, 20],
    queryFn: () => stockApi.tradingFlow(ticker, 20).then((r) => r.data),
  })
  const intradayQ = useQuery({
    queryKey: ['intraday', ticker],
    queryFn: () => stockApi.intraday(ticker).then((r) => r.data),
  })
  const { data: fundamentals } = useQuery({
    queryKey: ['fundamentals', ticker],
    queryFn: () => stockApi.fundamentals(ticker).then((r) => r.data),
  })
  const { data: news } = useQuery({
    queryKey: ['news', ticker],
    queryFn: () => stockApi.news(ticker).then((r) => r.data),
  })
  const { data: insights } = useQuery({
    queryKey: ['insights', ticker],
    queryFn: () => stockApi.insights(ticker).then((r) => r.data),
  })

  const stock = stockQ.data
  const prices = pricesQ.data
  const flow = flowQ.data
  const intraday = intradayQ.data

  // 이 종목만 재수집 후 관련 쿼리 무효화.
  const collect = useMutation({
    mutationFn: () => dataApi.collectOne(ticker).then((r) => r.data),
    onSuccess: () => queryClient.invalidateQueries(),
  })

  // 시세/매매동향은 오름차순 정렬이므로 마지막 원소가 최신일.
  const latest = prices && prices.length ? prices[prices.length - 1] : null
  const recentFlow = flow && flow.length ? flow[flow.length - 1] : null

  return (
    <div className="container">
      <div className="detail-head">
        <Link to="/" className="back">← 목록</Link>
        <button className="btn sm" onClick={() => collect.mutate()} disabled={collect.isPending}>
          {collect.isPending ? (
            <>
              <span className="spinner" /> 수집 중…
            </>
          ) : (
            '새로고침'
          )}
        </button>
      </div>

      <header className="stock-head">
        <h1>
          {stock ? stock.name : ticker} <span className="tag">{stock?.type}</span>
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
        <h2>핵심포인트</h2>
        <InsightsCard data={insights} />
      </section>

      <section className="card">
        <h2>{fundamentals?.type === 'ETF' ? 'ETF 정보' : '펀더멘털'}</h2>
        <FundamentalsCard data={fundamentals} />
      </section>

      <section className="card">
        <h2>가격 흐름 (최근 60거래일)</h2>
        <ChartState query={pricesQ}>
          <PriceChart data={prices} />
        </ChartState>
      </section>

      <section className="card">
        <h2>투자자별 매매동향 (최근 20거래일)</h2>
        <ChartState query={flowQ}>
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
        </ChartState>
      </section>

      <section className="card">
        <div className="card-head">
          <h2>오늘의 체결 흐름 (분봉)</h2>
          <button
            className="btn sm ghost"
            onClick={() => intradayQ.refetch()}
            disabled={intradayQ.isFetching}
          >
            {intradayQ.isFetching ? (
              <>
                <span className="spinner" /> 갱신 중…
              </>
            ) : (
              '분봉 새로고침'
            )}
          </button>
        </div>
        <ChartState query={intradayQ}>
          <IntradayChart data={intraday} />
        </ChartState>
      </section>

      <section className="card">
        <h2>관련 뉴스</h2>
        <NewsTimeline items={news} />
      </section>
    </div>
  )
}
