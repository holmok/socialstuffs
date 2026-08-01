import type { CSSObject } from '@styles/index'

export default {
  '*, *::before, *::after': {
    boxSizing: 'border-box'
  },
  '*:not(dialog)': {
    margin: '0'
  },
  '@media (prefers-reduced-motion: no-preference)': {
    html: {
      interpolateSize: 'allow-keywords'
    }
  },
  body: {
    lineHeight: '1.5',
    WebkitFontSmoothing: 'antialiased'
  },
  'img, picture, video, canvas, svg': {
    display: 'block',
    maxWidth: '100%'
  },
  'input, button, textarea, select': {
    font: 'inherit'
  },
  'p, h1, h2, h3, h4, h5, h6': {
    overflowWrap: 'break-word'
  },
  p: {
    textWrap: 'pretty'
  },
  'h1, h2, h3, h4, h5, h6': {
    textWrap: 'balance'
  },
  '#root, #__next': {
    isolation: 'isolate'
  }
} as CSSObject
