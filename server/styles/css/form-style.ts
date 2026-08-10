import type { CSSObject } from '@styles/index'
import * as colors from '../_colors'
import * as vars from '../_vars'

export default {
  h1: {
    textAlign: 'center'
  },
  '.form': {
    backgroundColor: colors.bgSurface,
    border: `${vars.borderWidthMain} solid ${colors.borderColor}`,
    borderRadius: vars.borderRadiusMain,
    padding: vars.spacingMain,
    maxWidth: vars.maxWidthForm,
    margin: '0 auto',
    label: {
      display: 'block',
      fontSize: vars.fontSizeSmall,
      color: colors.fgMuted,
      marginBottom: vars.spacingVerySmall,
      marginLeft: `calc(${vars.borderRadiusMain} / 2)`
    },
    'div.text-input': {
      marginBottom: vars.spacingMain
    },
    'label.error': {
      color: colors.fgError
    },
    input: {
      display: 'block',
      width: '100%',
      backgroundColor: colors.bgSurfaceLight,
      color: colors.fgMain,
      border: 'none',
      borderRadius: vars.borderRadiusSmall,
      padding: vars.spacingSmall
    },
    'input::placeholder': {
      color: colors.fgMutedMore
    },
    'input.error': {
      backgroundColor: colors.bgError,
      color: colors.fgError
    },
    'input.error::placeholder': {
      color: colors.fgErrorMuted
    },
    'input:-webkit-autofill, input:-webkit-autofill:hover, input:-webkit-autofill:focus': {
      WebkitBackgroundClip: 'text',
      WebkitBoxShadow: `0 0 0 1000px ${colors.bgMain} inset`,
      WebkitTextFillColor: colors.fgMain,
      caretColor: colors.fgMain
    },
    'input:autofill': {
      boxShadow: `0 0 0 1000px ${colors.bgMain} inset`
    },
    textarea: {
      display: 'block',
      width: '100%',
      backgroundColor: colors.bgSurfaceLight,
      color: colors.fgMain,
      border: 'none',
      borderRadius: vars.borderRadiusSmall,
      padding: vars.spacingSmall,
      resize: 'vertical',
      fontFamily: 'inherit',
      fontSize: 'inherit'
    },
    select: {
      display: 'block',
      width: '100%',
      backgroundColor: colors.bgSurfaceLight,
      color: colors.fgMain,
      border: 'none',
      borderRadius: vars.borderRadiusSmall,
      padding: vars.spacingSmall,
      fontFamily: 'inherit',
      fontSize: 'inherit'
    },
    'textarea::placeholder': {
      color: colors.fgMutedMore
    },
    'textarea.error': {
      backgroundColor: colors.bgError,
      color: colors.fgError
    },
    'textarea.error::placeholder': {
      color: colors.fgErrorMuted
    },
    'textarea.over-limit': {
      color: colors.fgError
    },
    // live counter under limited textareas, driven by char-count.js
    '.char-count': {
      fontSize: vars.fontSizeSmall,
      color: colors.fgMuted,
      textAlign: 'right',
      margin: `${vars.spacingVerySmall} 0 0`
    },
    '.char-count.warn': {
      color: colors.fgWarning
    },
    '.char-count.over': {
      color: colors.fgError
    },
    '.image-input': {
      textAlign: 'center'
    },
    '.image-preview': {
      display: 'block',
      width: '192px',
      height: '192px',
      objectFit: 'cover',
      borderRadius: '50%',
      margin: `0 auto ${vars.spacingSmall}`,
      backgroundColor: colors.bgSurfaceLight
    },
    // rectangular preview for post photos; starts hidden until a file is picked.
    // sized like the profile's post images: full width, tall images crop to their vertical middle
    '.post-image-preview': {
      display: 'block',
      width: '100%',
      maxHeight: '400px',
      objectFit: 'cover',
      borderRadius: vars.borderRadiusSmall,
      marginBottom: vars.spacingSmall,
      backgroundColor: colors.bgSurfaceLight
    },
    // the reset's `img { display: block }` outranks the UA [hidden] rule, so hide explicitly
    '.post-image-preview[hidden]': {
      display: 'none'
    },
    // visually hidden but still focusable, so tabbing to it outlines the styled label
    'input.file-input': {
      position: 'absolute',
      width: '1px',
      height: '1px',
      padding: 0,
      margin: '-1px',
      overflow: 'hidden',
      clipPath: 'inset(50%)',
      whiteSpace: 'nowrap'
    },
    '.file-button': {
      display: 'inline-block',
      backgroundColor: colors.bgSurfaceLight,
      color: colors.fgMain,
      padding: `${vars.spacingSmall} ${vars.spacingMain}`,
      fontSize: vars.fontSizeSmall,
      fontWeight: '500',
      borderRadius: vars.borderRadiusSmall,
      cursor: 'pointer',
      transition: `background-color ${vars.transitionMain}`
    },
    '.file-button:hover': {
      backgroundColor: colors.borderColor
    },
    'input.file-input:focus-visible ~ .file-button': {
      outline: `${vars.outlineWidthMain} solid ${colors.accentOrange}`,
      outlineOffset: vars.outlineWidthMain
    },
    '.file-name': {
      display: 'block',
      marginTop: vars.spacingVerySmall,
      fontSize: vars.fontSizeSmall,
      color: colors.fgMuted
    },
    'ul.errors': {
      listStyle: 'none',
      padding: 0,
      margin: 0,
      color: colors.fgError,
      fontSize: vars.fontSizeSmall,
      marginTop: vars.spacingVerySmall,
      marginLeft: `calc(${vars.borderRadiusMain} / 2)`
    },
    'ul.errors li': {
      marginLeft: vars.borderRadiusMain,
      lineHeight: vars.fontSizeMain,
      marginBottom: vars.spacingVerySmall
    },
    'ul.errors li::before': {
      content: '"⁃"',
      fontWeight: 'bold',
      fontSize: vars.fontSizeMain,
      display: 'inline-block',
      width: vars.spacingSmall,
      marginLeft: `calc(${vars.spacingSmall} * -1)`
    },
    button: {
      width: '100%',
      backgroundColor: colors.accentOrange,
      color: colors.bgMain,
      fontWeight: '600'
    },
    'button:hover': {
      backgroundColor: colors.fgAccent
    },
    'button:disabled': {
      opacity: '0.6',
      cursor: 'not-allowed'
    },
    'button:disabled:hover': {
      backgroundColor: colors.accentOrange
    },
    '.form-indicator': {
      display: 'none',
      textAlign: 'center',
      fontSize: vars.fontSizeSmall,
      color: colors.fgMuted,
      marginTop: vars.spacingSmall
    },
    // quiet destructive trigger under the submit button; the real action sits behind a confirm dialog
    '.post-delete-link': {
      display: 'block',
      width: 'auto',
      margin: `${vars.spacingSmall} auto 0`,
      padding: vars.spacingVerySmall,
      backgroundColor: 'transparent',
      color: colors.fgError,
      fontSize: vars.fontSizeSmall,
      fontWeight: '400'
    },
    '.post-delete-link:hover': {
      backgroundColor: 'transparent',
      textDecoration: 'underline'
    },
    '.form-indicator.htmx-request': {
      display: 'block'
    },
    '.form-links': {
      display: 'flex',
      justifyContent: 'space-between',
      fontSize: vars.fontSizeSmall,
      marginTop: vars.spacingMain
    },
    '.form-errors': {
      backgroundColor: colors.bgError,
      color: colors.fgError,
      padding: vars.spacingSmall,
      borderRadius: vars.borderRadiusMain,
      marginBottom: vars.spacingMain
    },
    '.form-errors p:last-child': {
      marginBottom: 0
    },
    '.form-alt': {
      textAlign: 'center',
      fontSize: vars.fontSizeSmall,
      color: colors.fgMain,
      marginTop: vars.spacingMain,
      marginBottom: '0'
    }
  }
} as CSSObject
