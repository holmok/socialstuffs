import type { CSSObject } from '@styles/index'
import * as colors from '../_colors'
import * as vars from '../_vars'

const delimiterBorder = `${vars.borderWidthMain} solid ${colors.borderColor}`

export default {
  html: {
    backgroundColor: colors.bgMain,
    color: colors.fgMain,
    colorScheme: 'dark',
    fontFamily: vars.fontMain,
    fontSize: vars.fontSizeMain
  },
  '@media (prefers-reduced-motion: no-preference)': {
    html: {
      scrollBehavior: 'smooth'
    }
  },
  body: {
    minHeight: '100dvh',
    display: 'flex',
    flexDirection: 'column',
    paddingTop: vars.headerHeight
  },
  main: {
    width: '100%',
    maxWidth: vars.maxWidthMain,
    margin: '0 auto',
    padding: vars.spacingMain,
    flex: '1 0 auto'
  },
  h1: {
    fontSize: vars.fontSizeLarge,
    letterSpacing: '-0.02em',
    lineHeight: '1.2',
    paddingBottom: vars.spacingSmall
  },
  'h2, h3': {
    letterSpacing: '-0.01em'
  },
  p: {
    lineHeight: '1.6',
    marginBottom: vars.spacingMain
  },
  a: {
    color: colors.fgAccent,
    textUnderlineOffset: '3px',
    textDecorationThickness: '1px'
  },
  'a, button': {
    transition: `background-color ${vars.transitionMain}, color ${vars.transitionMain}, border-color ${vars.transitionMain}, opacity ${vars.transitionMain}`
  },
  ':focus-visible': {
    outline: `${vars.outlineWidthMain} solid ${colors.accentOrange}`,
    outlineOffset: vars.outlineWidthMain
  },
  button: {
    backgroundColor: colors.bgSurface,
    color: colors.fgMain,
    border: 'none',
    padding: `${vars.spacingSmall} ${vars.spacingMain}`,
    fontSize: vars.fontSizeMain,
    fontWeight: '500',
    borderRadius: vars.borderRadiusSmall,
    cursor: 'pointer'
  },
  'button:hover': {
    backgroundColor: colors.borderColor
  },
  'button:active': {
    transform: 'translateY(1px)'
  },
  '.error-fragment': {
    backgroundColor: colors.bgError,
    color: colors.fgError,
    padding: vars.spacingSmall,
    borderRadius: vars.borderRadiusMain
  },
  '.flash': {
    maxWidth: vars.maxWidthMain,
    margin: '0 auto',
    padding: `${vars.spacingMain} ${vars.spacingMain} 0`,
    display: 'grid',
    gap: vars.spacingSmall
  },
  '.flash-item': {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: vars.spacingMid,
    backgroundColor: colors.bgInfo,
    color: colors.accentBlue,
    borderRadius: vars.borderRadiusMain,
    padding: `${vars.spacingSmall} ${vars.spacingMid}`,
    p: {
      margin: '0',
      lineHeight: '1.4'
    }
  },
  '.flash-success': {
    backgroundColor: colors.bgSuccess,
    color: colors.fgSuccess
  },
  '.flash-error': {
    backgroundColor: colors.bgError,
    color: colors.fgError
  },
  '.flash-close': {
    backgroundColor: 'transparent',
    color: 'inherit',
    fontSize: vars.fontSizeMid,
    lineHeight: '1',
    padding: '0',
    border: 'none',
    flexShrink: '0',
    cursor: 'pointer',
    position: 'relative',
    top: '-2px'
  },
  '.flash-close:hover': {
    backgroundColor: 'transparent',
    color: colors.fgMain
  },
  '.card': {
    backgroundColor: colors.bgSurface,
    border: delimiterBorder,
    borderRadius: vars.borderRadiusMain,
    padding: vars.spacingMain
  },
  header: {
    position: 'fixed',
    top: '0',
    left: '0',
    right: '0',
    height: vars.headerHeight,
    backgroundColor: colors.bgMain,
    borderBottom: delimiterBorder,
    zIndex: '1'
  },
  footer: {
    height: vars.footerHeight,
    backgroundColor: colors.bgMain,
    borderTop: delimiterBorder,
    zIndex: '1',
    position: 'fixed',
    bottom: '0',
    left: '0',
    right: '0'
  },
  '.header-inner, .footer-inner': {
    maxWidth: vars.maxWidthMain,
    height: '100%',
    margin: '0 auto',
    padding: `0 ${vars.spacingMain}`,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between'
  },
  '.footer-inner': {
    fontSize: vars.fontSizeSmall
  },
  '.site-title': {
    color: colors.fgMain,
    fontWeight: 'bold',
    fontSize: vars.fontSizeLarge,
    letterSpacing: '-0.02em',
    textDecoration: 'none'
  },
  '.site-title:hover': {
    textDecoration: 'none'
  },
  '.site-title span': {
    color: colors.accentOrange
  },
  '.copyright': {
    color: colors.fgMuted,
    margin: '0'
  },
  'nav ul': {
    display: 'flex',
    gap: vars.spacingMain,
    listStyle: 'none',
    margin: '0',
    padding: '0'
  },
  'nav a': {
    color: colors.fgMain,
    textDecoration: 'none'
  },
  'nav a:hover': {
    color: colors.fgAccent
  },
  'nav ul button': {
    backgroundColor: 'transparent',
    color: colors.fgMain,
    padding: '0',
    borderRadius: '0'
  },
  'nav ul button:hover': {
    backgroundColor: 'transparent',
    color: colors.fgAccent
  },
  '.nav-toggle': {
    display: 'none',
    backgroundColor: 'transparent',
    fontSize: vars.fontSizeLarge,
    padding: '0',
    border: 'none',
    cursor: 'pointer'
  },
  '.nav-toggle:hover': {
    backgroundColor: 'transparent'
  },
  [`@media (max-width: ${vars.breakpointMobile})`]: {
    '.nav-toggle': {
      display: 'block'
    },
    'nav ul': {
      display: 'none',
      position: 'absolute',
      top: '100%',
      left: '0',
      right: '0',
      flexDirection: 'column',
      gap: '0',
      backgroundColor: colors.bgMain,
      borderBottom: delimiterBorder,
      padding: `${vars.spacingSmall} 0`
    },
    'nav ul.open': {
      display: 'flex',
      borderTop: delimiterBorder,
      zIndex: '1'
    },
    'nav a': {
      display: 'block',
      padding: `${vars.spacingSmall} ${vars.spacingMain}`,
      textAlign: 'center',
      textDecoration: 'none'
    },
    'nav a:hover': {
      backgroundColor: colors.bgSurface
    },
    'nav ul button': {
      display: 'block',
      width: '100%',
      padding: `${vars.spacingSmall} ${vars.spacingMain}`,
      textAlign: 'center'
    },
    'nav ul button:hover': {
      backgroundColor: colors.bgSurface
    }
  }
} as CSSObject
