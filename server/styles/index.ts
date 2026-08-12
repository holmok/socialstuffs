import type * as CSS from 'csstype'

import adminStyles from './css/admin-style'
import errorStyles from './css/error-style'
import authStyles from './css/form-style'
import globalStyles from './css/global-style'
import homeStyles from './css/home-style'
import infoStyles from './css/info-style'
import postStyles from './css/post-style'
import profileStyles from './css/profile-style'
import resetStyles from './css/reset-style'
import userStyles from './css/user-style'

const stylesMap = {
  global: renderCSS(globalStyles),
  reset: renderCSS(resetStyles),
  auth: renderCSS(authStyles),
  info: renderCSS(infoStyles),
  error: renderCSS(errorStyles),
  user: renderCSS(userStyles),
  profile: renderCSS(profileStyles),
  home: renderCSS(homeStyles),
  post: renderCSS(postStyles),
  admin: renderCSS(adminStyles)
}

export type style = keyof typeof stylesMap

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

// nested selector objects flatten to descendant selectors ('.form' > 'label' emits '.form label')
// rather than native CSS nesting, which browsers older than ~Chrome 120/Safari 17.2 silently drop.
// Comma lists on either side expand to their cross product; at-rules keep wrapping their contents.
export function renderCSS(styles: CSSObject): string {
  return renderRules(styles, '').trim()
}

function renderRules(obj: CSSObject, selector: string): string {
  let declarations = ''
  let nested = ''

  for (const [key, value] of Object.entries(obj)) {
    if (value === undefined || value === null) continue

    if (typeof value === 'object') {
      if (key.startsWith('@')) {
        nested += `${key} { ${renderRules(value as CSSObject, selector).trim()} } `
      } else {
        nested += renderRules(value as CSSObject, joinSelectors(selector, key))
      }
    } else {
      const cssValue = typeof value === 'number' && value !== 0 ? `${value}px` : value
      declarations += `${toKebabCase(key)}: ${cssValue}; `
    }
  }

  const rule = declarations && selector ? `${selector} { ${declarations.trim()} } ` : declarations
  return rule + nested
}

function joinSelectors(parent: string, child: string): string {
  if (!parent) return child
  const combos: string[] = []
  for (const p of parent.split(',')) {
    for (const c of child.split(',')) {
      combos.push(`${p.trim()} ${c.trim()}`)
    }
  }
  return combos.join(', ')
}
