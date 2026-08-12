import type { CSSObject } from '@styles/index'
import * as colors from '../_colors'
import { cardSurface, hairline } from '../_mixins'
import * as vars from '../_vars'

export default {
  '.admin-stats': {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
    gap: vars.spacingMid
  },
  '.stat-card': {
    ...cardSurface,
    textAlign: 'center'
  },
  '.stat-value': {
    fontSize: vars.fontSizeLarge,
    fontWeight: '600',
    margin: '0'
  },
  '.stat-label': {
    color: colors.fgMutedMore,
    fontSize: vars.fontSizeSmall,
    margin: `${vars.spacingVerySmall} 0 0`
  },
  '.stat-note': {
    color: colors.fgMuted,
    fontSize: vars.fontSizeSmall,
    margin: '0'
  },
  '.admin-note': {
    color: colors.fgMuted,
    fontSize: vars.fontSizeSmall,
    textAlign: 'center',
    maxWidth: vars.maxWidthMain,
    margin: `0 auto ${vars.spacingMid}`
  },
  // narrow screens scroll the table inside its own container instead of the page
  '.admin-table-wrap': {
    overflowX: 'auto'
  },
  '.admin-table': {
    width: '100%',
    borderCollapse: 'collapse',
    fontSize: vars.fontSizeSmall,
    th: {
      textAlign: 'left',
      color: colors.fgMuted,
      fontWeight: '500',
      padding: vars.spacingSmall,
      borderBottom: hairline
    },
    td: {
      padding: vars.spacingSmall,
      borderBottom: hairline
    }
  },
  '.admin-check-col': {
    width: '1%'
  },
  '.admin-actions': {
    textAlign: 'center',
    margin: `${vars.spacingMid} 0`
  },
  '.admin-pagination': {
    display: 'flex',
    justifyContent: 'center',
    gap: vars.spacingMain,
    margin: `${vars.spacingMid} 0`
  },
  '.admin-empty': {
    color: colors.fgMuted,
    fontSize: vars.fontSizeSmall,
    textAlign: 'center'
  },
  // standard screen-reader-only utility (kept out of global to avoid touching shared styles)
  '.visually-hidden': {
    position: 'absolute',
    width: '1px',
    height: '1px',
    padding: '0',
    margin: '-1px',
    overflow: 'hidden',
    clipPath: 'inset(50%)',
    whiteSpace: 'nowrap',
    border: '0'
  }
} as CSSObject
