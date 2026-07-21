// 종목 핵심포인트(인사이트) 카드. 백엔드의 규칙 기반 요약을 신호별로 표시.

// 신호 강도(level)에 따른 점 색상: 한국 시장 관례(상승·매수우위=빨강, 하락·매도우위=파랑).
const LEVEL_COLOR = {
  positive: '#d60000',
  negative: '#0051c7',
  neutral: '#8a8f98',
}

export default function InsightsCard({ data }) {
  if (!data) return null

  const { summary, signals = [], disclaimer } = data

  return (
    <div className="insights">
      <p className="insights-summary">{summary}</p>

      {signals.length > 0 && (
        <ul className="signal-list">
          {signals.map((s) => (
            <li key={s.key} className="signal">
              <span className="signal-dot" style={{ background: LEVEL_COLOR[s.level] }} />
              <div>
                <span className="signal-label">{s.label}</span>
                <span className="signal-text">{s.text}</span>
              </div>
            </li>
          ))}
        </ul>
      )}

      {disclaimer && <p className="insights-disclaimer">※ {disclaimer}</p>}
    </div>
  )
}
