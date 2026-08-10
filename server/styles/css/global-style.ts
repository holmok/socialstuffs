import type { CSSObject } from '@styles/index'
import * as colors from '../_colors'
import { cardSurface, hairline } from '../_mixins'
import * as vars from '../_vars'

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
    paddingTop: vars.headerHeight,
    paddingBottom: vars.footerHeight
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
    width: '100%',
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
  // sized as a comfortable touch target; negative margins keep the flash item's height and glyph position
  '.flash-close': {
    backgroundColor: 'transparent',
    color: 'inherit',
    fontSize: vars.fontSizeMid,
    lineHeight: '1',
    padding: '0',
    border: 'none',
    flexShrink: '0',
    cursor: 'pointer',
    minWidth: '32px',
    minHeight: '32px',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    margin: `-${vars.spacingVerySmall} -${vars.spacingSmall} -${vars.spacingVerySmall} 0`
  },
  '.flash-close:hover': {
    backgroundColor: 'transparent',
    color: colors.fgMain
  },
  // the lightbox dialog is created by lightbox.js and appended to <body>
  '.lightbox': {
    backgroundColor: 'transparent',
    border: 'none',
    padding: '0',
    maxWidth: '90vw',
    maxHeight: '90vh'
  },
  '.lightbox::backdrop': {
    backgroundColor: 'rgba(0, 0, 0, 0.8)'
  },
  '.lightbox-image': {
    display: 'block',
    maxWidth: '90vw',
    maxHeight: '85vh',
    objectFit: 'contain',
    borderRadius: vars.borderRadiusSmall
  },
  // fixed so it pins to the viewport corner regardless of the image size
  '.lightbox-close': {
    position: 'fixed',
    top: vars.spacingMain,
    right: vars.spacingMain,
    backgroundColor: 'transparent',
    color: colors.fgMain,
    fontSize: vars.fontSizeLarge,
    lineHeight: '1',
    padding: vars.spacingVerySmall,
    border: 'none',
    cursor: 'pointer'
  },
  '.lightbox-close:hover': {
    backgroundColor: 'transparent',
    color: colors.fgAccent
  },
  '.card': {
    ...cardSurface
  },
  // small muted helper text used under form controls and inside cards/dialogs
  '.form-note': {
    fontSize: vars.fontSizeSmall,
    color: colors.fgMuted,
    marginBottom: vars.spacingMid
  },
  // skip-to-content link: visually hidden until keyboard focus lands on it
  '.skip-link': {
    position: 'absolute',
    width: '1px',
    height: '1px',
    padding: 0,
    margin: '-1px',
    overflow: 'hidden',
    clipPath: 'inset(50%)',
    whiteSpace: 'nowrap'
  },
  // fixed above the fixed header (z-index 1) when focused
  '.skip-link:focus': {
    position: 'fixed',
    top: vars.spacingSmall,
    left: vars.spacingSmall,
    width: 'auto',
    height: 'auto',
    margin: '0',
    padding: `${vars.spacingSmall} ${vars.spacingMain}`,
    overflow: 'visible',
    clipPath: 'none',
    zIndex: '2',
    backgroundColor: colors.bgSurface,
    color: colors.fgMain,
    borderRadius: vars.borderRadiusSmall,
    textDecoration: 'none'
  },
  // confirm dialogs (post delete, account delete) — shared by every dialog-using page
  '.delete-modal': {
    ...cardSurface,
    color: colors.fgMain,
    width: '90%',
    maxWidth: '420px'
  },
  '.delete-modal::backdrop': {
    backgroundColor: 'rgba(0, 0, 0, 0.6)'
  },
  '.delete-modal h3': {
    marginBottom: vars.spacingSmall
  },
  '.delete-modal input': {
    display: 'block',
    width: '100%',
    backgroundColor: colors.bgSurfaceLight,
    color: colors.fgMain,
    border: 'none',
    borderRadius: vars.borderRadiusSmall,
    padding: vars.spacingSmall,
    marginBottom: vars.spacingMain
  },
  '.delete-modal input::placeholder': {
    color: colors.fgMutedMore
  },
  '.modal-actions': {
    display: 'flex',
    justifyContent: 'space-between',
    gap: vars.spacingSmall
  },
  // outlined destructive action, used inside the confirm dialogs and the user data page
  '.danger-button': {
    backgroundColor: 'transparent',
    color: colors.fgError,
    border: `${vars.borderWidthMain} solid ${colors.fgError}`
  },
  '.danger-button:hover': {
    backgroundColor: colors.bgError
  },
  '.danger-button:disabled': {
    opacity: '0.5',
    cursor: 'not-allowed'
  },
  '.danger-button:disabled:hover': {
    backgroundColor: 'transparent'
  },
  header: {
    position: 'fixed',
    top: '0',
    left: '0',
    right: '0',
    height: vars.headerHeight,
    backgroundColor: colors.bgMain,
    borderBottom: hairline,
    zIndex: '1'
  },
  footer: {
    height: vars.footerHeight,
    backgroundColor: colors.bgMain,
    borderTop: hairline,
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
    // the fixed 52px footer overflows on narrow viewports once its links wrap;
    // let it flow after the content (auto height) and drop the matching body padding
    body: {
      paddingBottom: '0'
    },
    footer: {
      position: 'static',
      height: 'auto'
    },
    '.footer-inner': {
      height: 'auto',
      flexWrap: 'wrap',
      justifyContent: 'center',
      gap: `0 ${vars.spacingSmall}`,
      padding: `${vars.spacingSmall} ${vars.spacingMain}`
    },
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
      borderBottom: hairline,
      padding: `${vars.spacingSmall} 0`
    },
    'nav ul.open': {
      display: 'flex',
      borderTop: hairline,
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
