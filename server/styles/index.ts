import type * as CSS from 'csstype'

import errorStyles from './css/error-style'
import authStyles from './css/form-style'
import globalStyles from './css/global-style'
import infoStyles from './css/info-style'
import profileStyles from './css/profile-style'
import resetStyles from './css/reset-style'
import userStyles from './css/user-style'

export type style = 'global' | 'reset' | 'auth' | 'info' | 'error' | 'user' | 'profile'

const stylesMap: Record<style, string> = {
  global: renderCSS(globalStyles),
  reset: renderCSS(resetStyles),
  auth: renderCSS(authStyles),
  info: renderCSS(infoStyles),
  error: renderCSS(errorStyles),
  user: renderCSS(userStyles),
  profile: renderCSS(profileStyles)
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
