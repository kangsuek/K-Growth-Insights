import { formatNumber, formatPrice, formatPct, changeColor } from '../utils/format'

// 라벨-값 한 칸. 값이 없으면 '-' 표시.
function Metric({ label, value }) {
  return (
    <div className="metric">
      <div className="metric-label">{label}</div>
      <div className="metric-value">{value ?? '-'}</div>
    </div>
  )
}

// 배수(PER/PBR): 예 20.93 -> "20.93배"
const times = (v) => (v == null ? null : `${formatNumber(v)}배`)
// 비율(%): 부호 없이 예 46.59 -> "46.59%"
const percent = (v) => (v == null ? null : `${formatNumber(v)}%`)

// 주식 펀더멘털: PER/PBR/EPS/BPS/배당/외인소진율/52주 등.
function StockFundamentals({ data }) {
  return (
    <div className="metric-grid">
      <Metric label="PER" value={times(data.per)} />
      <Metric label="PBR" value={times(data.pbr)} />
      <Metric label="추정 PER" value={times(data.est_per)} />
      <Metric label="EPS" value={data.eps == null ? null : formatPrice(data.eps)} />
      <Metric label="BPS" value={data.bps == null ? null : formatPrice(data.bps)} />
      <Metric label="추정 EPS" value={data.est_eps == null ? null : formatPrice(data.est_eps)} />
      <Metric label="배당수익률" value={percent(data.dividend_yield)} />
      <Metric label="주당배당금" value={data.dividend == null ? null : formatPrice(data.dividend)} />
      <Metric label="외인소진율" value={percent(data.foreign_rate)} />
      <Metric label="52주 최고" value={data.high_52w == null ? null : formatPrice(data.high_52w)} />
      <Metric label="52주 최저" value={data.low_52w == null ? null : formatPrice(data.low_52w)} />
      <Metric label="시가총액" value={data.market_value} />
    </div>
  )
}

// 수익률: 부호·색상 반영.
function ReturnMetric({ label, value }) {
  return (
    <div className="metric">
      <div className="metric-label">{label}</div>
      <div className="metric-value" style={value != null ? { color: changeColor(value) } : undefined}>
        {value == null ? '-' : formatPct(value)}
      </div>
    </div>
  )
}

// ETF 펀더멘털: NAV/괴리율/보수/수익률 + 구성종목 Top10.
function EtfFundamentals({ data, holdings }) {
  return (
    <>
      <div className="metric-grid">
        <Metric label="운용사" value={data.issuer_name} />
        <Metric label="순자산총액" value={data.total_nav} />
        <Metric label="시가총액" value={data.market_value} />
        <Metric label="NAV" value={data.nav == null ? null : formatPrice(data.nav)} />
        <Metric label="괴리율" value={percent(data.deviation_rate)} />
        <Metric label="총보수" value={percent(data.total_fee)} />
        <Metric label="배당수익률(TTM)" value={percent(data.dividend_yield)} />
        <ReturnMetric label="1개월 수익률" value={data.return_1m} />
        <ReturnMetric label="3개월 수익률" value={data.return_3m} />
        <ReturnMetric label="1년 수익률" value={data.return_1y} />
      </div>

      {holdings && holdings.length > 0 && (
        <div className="holdings">
          <h3>구성종목 Top {holdings.length}</h3>
          <table className="holdings-table">
            <thead>
              <tr>
                <th>#</th>
                <th>종목</th>
                <th className="num">비중</th>
              </tr>
            </thead>
            <tbody>
              {holdings.map((h) => (
                <tr key={h.seq}>
                  <td>{h.seq}</td>
                  <td>
                    {h.item_name}
                    <span className="holdings-code"> {h.item_code}</span>
                  </td>
                  <td className="num">{percent(h.weight)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  )
}

// 종목 유형(STOCK/ETF)에 따라 주식/ETF 펀더멘털을 분기 렌더링.
export default function FundamentalsCard({ data }) {
  if (!data) return null

  const isEtf = data.type === 'ETF'
  const payload = isEtf ? data.etf : data.stock
  if (!payload) {
    return <div className="empty">펀더멘털 데이터가 없습니다. (수집 후 표시됩니다)</div>
  }

  return isEtf ? (
    <EtfFundamentals data={payload} holdings={data.holdings} />
  ) : (
    <StockFundamentals data={payload} />
  )
}
