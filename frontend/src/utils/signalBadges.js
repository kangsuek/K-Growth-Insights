/**
 * 전일 대비 MACD 골든/데드크로스·RSI 과매수/과매도 신규 진입 배지.
 *
 * 종목 발굴(ScreeningTable)과 대시보드(SignalSummaryCard) 양쪽에서 같은 라벨·색상을
 * 쓰도록 한 곳에 둔다.
 */
export function getSignalBadges(item) {
  const badges = []
  if (item.macd_cross_signal === 'golden') {
    badges.push({ key: 'macd-golden', text: '▲골든크로스', className: 'bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300' })
  } else if (item.macd_cross_signal === 'dead') {
    badges.push({ key: 'macd-dead', text: '▼데드크로스', className: 'bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300' })
  }
  if (item.rsi_zone_entered === 'overbought') {
    badges.push({ key: 'rsi-overbought', text: 'RSI 과매수', className: 'bg-orange-100 dark:bg-orange-900/40 text-orange-700 dark:text-orange-300' })
  } else if (item.rsi_zone_entered === 'oversold') {
    badges.push({ key: 'rsi-oversold', text: 'RSI 과매도', className: 'bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300' })
  }
  return badges
}
