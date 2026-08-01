import type * as CSS from 'csstype'

import authStyles from './css/auth-style'
import globalStyles from './css/global-style'
import resetStyles from './css/reset-style'

export type style = 'global' | 'reset' | 'auth'

const stylesMap: Record<style, string> = {
  global: renderCSS(globalStyles),
  reset: renderCSS(resetStyles),
  auth: renderCSS(authStyles)
}

const cachedStyleCombos: Record<string, string> = {}

export type CSSObject = CSS.Properties<string | number> & {
  [K in string]: CSSObject | string | number | undefined
}

export default function getStyle(styles: style[]): string {
  const cacheKey = styles.join('-')
  if (cachedStyleCombos[cacheKey]) {
    return cachedStyleCombos[cacheKey]
  }

  const combinedStyles = combineStyles(styles)
  cachedStyleCombos[cacheKey] = combinedStyles
  return combinedStyles
}

function combineStyles(styles: style[]): string {
  let output = ''
  for (const style of styles) {
    output += stylesMap[style]
  }
  return output
}

function toKebabCase(str: string) {
  return str.replace(/[A-Z]/g, (match) => `-${match.toLowerCase()}`)
}

function renderCSS(styles: CSSObject): string {
  let cssString = ''

  for (const [property, value] of Object.entries(styles)) {
    if (value === undefined || value === null) continue

    if (typeof value === 'object') {
      cssString += `${property} { ${renderCSS(value as CSSObject)} } `
    } else {
      const cssValue = typeof value === 'number' && value !== 0 ? `${value}px` : value
      cssString += `${toKebabCase(property)}: ${cssValue}; `
    }
  }

  return cssString.trim()
}
