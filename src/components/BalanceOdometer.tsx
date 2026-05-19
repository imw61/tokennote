import type { CSSProperties } from 'react'
import { useMemo } from 'react'

type OdometerToken =
  | { kind: 'digit'; char: string; key: string }
  | { kind: 'char'; char: string; key: string }

const DIGIT_GLYPHS = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9']

const buildOdometerTokens = (
  value: number,
  symbol: string,
  fractionDigits: number
): OdometerToken[] => {
  const safeValue = Number.isFinite(value) ? value : 0
  const absValue = Math.abs(safeValue)
  const [integerPart, fractionPart = ''] = absValue.toFixed(fractionDigits).split('.')
  const reversedIntegerDigits = integerPart.split('').reverse()
  const integerTokens: OdometerToken[] = []

  reversedIntegerDigits.forEach((char, index) => {
    integerTokens.push({ kind: 'digit', char, key: `int-${index}` })
    if ((index + 1) % 3 === 0 && index < reversedIntegerDigits.length - 1) {
      integerTokens.push({ kind: 'char', char: ',', key: `sep-${index + 1}` })
    }
  })

  integerTokens.reverse()

  const tokens: OdometerToken[] = []

  if (safeValue < 0) {
    tokens.push({ kind: 'char', char: '-', key: 'sign' })
  }

  tokens.push({ kind: 'char', char: symbol, key: 'currency' })
  tokens.push(...integerTokens)

  if (fractionDigits > 0) {
    tokens.push({ kind: 'char', char: '.', key: 'dot' })
    for (let index = 0; index < fractionDigits; index += 1) {
      tokens.push({
        kind: 'digit',
        char: fractionPart[index] ?? '0',
        key: `frac-${index}`
      })
    }
  }

  return tokens
}

export function BalanceOdometer({
  value,
  symbol = '$',
  fractionDigits = 2,
  className = ''
}: {
  value: number
  symbol?: string
  fractionDigits?: number
  className?: string
}) {
  const tokens = useMemo(
    () => buildOdometerTokens(value, symbol, fractionDigits),
    [fractionDigits, symbol, value]
  )
  const accessibleLabel = tokens.map(token => token.char).join('')

  return (
    <span className={`widget-odometer ${className}`.trim()} aria-label={accessibleLabel}>
      {tokens.map(token => {
        if (token.kind === 'char') {
          return (
            <span key={token.key} className="widget-odometer-char">
              {token.char}
            </span>
          )
        }

        return (
          <span key={token.key} className="widget-odometer-digit" aria-hidden="true">
            <span
              className="widget-odometer-digit-track"
              style={{ '--digit-index': Number(token.char) } as CSSProperties}
            >
              {DIGIT_GLYPHS.map(glyph => (
                <span key={glyph} className="widget-odometer-glyph">
                  {glyph}
                </span>
              ))}
            </span>
          </span>
        )
      })}
    </span>
  )
}
