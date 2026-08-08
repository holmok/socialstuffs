import type { CSSObject } from '@styles/index'
import * as colors from '../_colors'
import * as vars from '../_vars'

const sectionGap = `calc(${vars.spacingMain} * 2)`

export default {
  h2: {
    fontSize: vars.fontSizeMid,
    margin: `${sectionGap} 0 ${vars.spacingSmall}`
  },
  '.highlight, .stuff': {
    color: colors.accentOrange
  },
  '.eyebrow': {
    color: colors.fgMuted,
    fontSize: vars.fontSizeSmall,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: '0.08em',
    marginBottom: vars.spacingSmall
  },
  '.hero': {
    padding: `${sectionGap} 0`,
    textAlign: 'center',
    h1: {
      fontSize: vars.fontSizeHero,
      lineHeight: '1.15',
      letterSpacing: '-0.02em',
      maxWidth: '18em',
      margin: '0 auto',
      paddingBottom: vars.spacingMid
    },
    '.tagline': {
      color: colors.fgMuted,
      fontSize: vars.fontSizeMid,
      maxWidth: '32em',
      margin: '0 auto'
    }
  },
  '.hero-actions': {
    display: 'flex',
    justifyContent: 'center',
    flexWrap: 'wrap',
    gap: vars.spacingMid,
    marginTop: vars.spacingMain
  },
  '.cta': {
    display: 'inline-block',
    backgroundColor: colors.accentOrange,
    color: colors.bgMain,
    fontWeight: '600',
    padding: `${vars.spacingSmall} ${vars.spacingMain}`,
    borderRadius: vars.borderRadiusSmall,
    textDecoration: 'none',
    transition: `background-color ${vars.transitionMain}, color ${vars.transitionMain}, border-color ${vars.transitionMain}`
  },
  '.cta:hover': {
    backgroundColor: colors.fgAccent
  },
  '.cta:active': {
    transform: 'translateY(1px)'
  },
  '.cta.quiet': {
    backgroundColor: 'transparent',
    border: `${vars.borderWidthMain} solid ${colors.borderColor}`,
    color: colors.fgMain
  },
  '.cta.quiet:hover': {
    backgroundColor: 'transparent',
    borderColor: colors.fgAccent,
    color: colors.fgAccent
  },
  '.pitch-header': {
    display: 'flex',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: vars.spacingSmall,
    marginBottom: vars.spacingMain,
    h2: {
      margin: '0'
    }
  },
  '.pitch-note': {
    color: colors.fgMuted,
    fontSize: vars.fontSizeSmall
  },
  '.pitch-list': {
    listStyle: 'none',
    padding: '0',
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: vars.spacingMain,
    li: {
      backgroundColor: colors.bgSurface,
      border: `${vars.borderWidthMain} solid ${colors.borderColor}`,
      borderRadius: vars.borderRadiusMain,
      padding: vars.spacingMain
    },
    h3: {
      marginBottom: vars.spacingVerySmall
    },
    p: {
      color: colors.fgMuted,
      marginBottom: '0'
    }
  },
  '.closing': {
    marginTop: sectionGap,
    borderTop: `${vars.borderWidthMain} solid ${colors.borderColor}`,
    padding: `${sectionGap} 0 ${vars.spacingMain}`,
    textAlign: 'center'
  },
  '.about-hero': {
    h1: {
      fontSize: vars.fontSizeHero,
      lineHeight: '1.15',
      letterSpacing: '-0.02em',
      paddingBottom: vars.spacingMid
    },
    '.lead': {
      color: colors.fgMuted,
      fontSize: vars.fontSizeMid
    }
  },
  '.audience-list': {
    listStyle: 'none',
    padding: '0',
    marginBottom: vars.spacingMain,
    li: {
      borderLeft: `3px solid ${colors.accentOrange}`,
      padding: `${vars.spacingVerySmall} ${vars.spacingMid}`,
      marginBottom: vars.spacingSmall,
      lineHeight: '1.6'
    },
    strong: {
      color: colors.fgAccent
    }
  },
  '.never': {
    marginTop: sectionGap,
    backgroundColor: colors.bgSurface,
    border: `${vars.borderWidthMain} solid ${colors.borderColor}`,
    borderRadius: vars.borderRadiusMain,
    padding: vars.spacingMain,
    h2: {
      margin: `0 0 ${vars.spacingMain}`
    },
    ul: {
      listStyle: 'none',
      padding: '0',
      display: 'grid',
      gridTemplateColumns: '1fr 1fr',
      gap: `${vars.spacingSmall} ${vars.spacingMain}`
    },
    'li::before': {
      content: '"✕"',
      color: colors.fgError,
      fontWeight: 'bold',
      marginRight: vars.spacingSmall
    }
  },
  [`@media (max-width: ${vars.breakpointMobile})`]: {
    '.pitch-list, .never ul': {
      gridTemplateColumns: '1fr'
    }
  }
} as CSSObject
