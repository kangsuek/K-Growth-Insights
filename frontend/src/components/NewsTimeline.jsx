// 종목 뉴스 타임라인. 각 항목은 원문 링크로 새 탭 이동.

// ISO8601(또는 원문) 발행일시를 'YYYY.MM.DD HH:mm' 형태로 표시.
function formatPubDate(value) {
  if (!value) return ''
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return value
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}.${pad(d.getMonth() + 1)}.${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export default function NewsTimeline({ items }) {
  if (!items || items.length === 0) {
    return <div className="empty">표시할 뉴스가 없습니다. (검색 API 키 설정 후 수집됩니다)</div>
  }

  return (
    <ul className="news-list">
      {items.map((n) => (
        <li key={n.link} className="news-item">
          <a href={n.link} target="_blank" rel="noopener noreferrer" className="news-title">
            {n.title}
          </a>
          {n.description && <p className="news-desc">{n.description}</p>}
          <time className="news-date">{formatPubDate(n.pub_date)}</time>
        </li>
      ))}
    </ul>
  )
}
