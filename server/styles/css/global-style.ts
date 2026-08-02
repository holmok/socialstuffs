import type { CSSObject } from '@styles/index'
import * as colors from '../_colors'
import * as vars from '../_vars'

const delimiterBorder = `${vars.borderWidthMain} solid ${colors.borderColor}`

export default {
  html: {
    backgroundColor: colors.bgMain,
    color: colors.fgMain,
    fontFamily: vars.fontMain,
    fontSize: vars.fontSizeMain
  },
  '@media (prefers-reduced-motion: no-preference)': {
    html: {
      scrollBehavior: 'smooth'
    }
  },
  body: {
    paddingTop: vars.headerHeight,
    paddingBottom: vars.footerHeight
  },
  main: {
    maxWidth: vars.maxWidthMain,
    margin: '0 auto',
    padding: vars.spacingMain
  },
  h1: {
    fontSize: vars.fontSizeLarge,
    paddingBottom: vars.spacingSmall
  },
  p: {
    lineHeight: '1.6',
    marginBottom: vars.spacingMain
  },
  a: {
    color: colors.fgAccent
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
    borderRadius: vars.borderRadiusMain,
    cursor: 'pointer'
  },
  'button:hover': {
    backgroundColor: colors.borderColor
  },
  '.card': {
    backgroundColor: colors.bgSurface,
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
    position: 'fixed',
    bottom: '0',
    left: '0',
    right: '0',
    height: vars.footerHeight,
    backgroundColor: colors.bgMain,
    borderTop: delimiterBorder,
    zIndex: '1'
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
    color: colors.accentBlue
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
      borderTop: delimiterBorder
    },
    'nav a': {
      display: 'block',
      padding: `${vars.spacingSmall} ${vars.spacingMain}`,
      textAlign: 'center',
      textDecoration: 'none'
    },
    'nav a:hover': {
      backgroundColor: colors.bgSurface
    }
  }
} as CSSObject
