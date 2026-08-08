import type { CSSObject } from '@styles/index'
import * as colors from '../_colors'
import * as vars from '../_vars'

const sectionGap = `calc(${vars.spacingMain} * 2)`

export default {
  '.error-page': {
    textAlign: 'center',
    padding: `${sectionGap} 0`,
    '.status-code': {
      fontSize: '120px',
      fontWeight: 'bold',
      lineHeight: '1',
      letterSpacing: '4px',
      color: colors.bgSurfaceLight
    },
    h1: {
      fontSize: vars.fontSizeHero,
      lineHeight: '1.15',
      letterSpacing: '-0.02em',
      padding: `${vars.spacingMid} 0`
    },
    '.error-copy': {
      color: colors.fgMuted,
      fontSize: vars.fontSizeMid,
      maxWidth: '32em',
      margin: '0 auto'
    },
    '.error-actions': {
      display: 'flex',
      justifyContent: 'center',
      flexWrap: 'wrap',
      gap: vars.spacingMid,
      marginTop: vars.spacingMain
    },
    '.error-detail': {
      textAlign: 'left',
      backgroundColor: colors.bgSurface,
      border: `${vars.borderWidthMain} solid ${colors.borderColor}`,
      color: colors.fgMuted,
      fontSize: vars.fontSizeSmall,
      padding: vars.spacingMain,
      borderRadius: vars.borderRadiusMain,
      marginTop: sectionGap,
      overflowX: 'auto'
    }
  },
  [`@media (max-width: ${vars.breakpointMobile})`]: {
    '.error-page .status-code': {
      fontSize: '80px'
    }
  }
} as CSSObject
