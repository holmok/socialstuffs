import type { CSSObject } from '@styles/index'
import * as colors from '../_colors'
import * as vars from '../_vars'

export default {
  h1: {
    textAlign: 'center'
  },
  '.form': {
    backgroundColor: colors.bgSurface,
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
      borderRadius: vars.borderRadiusMain,
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
      backgroundColor: colors.accentBlue,
      color: colors.bgMain
    },
    'button:hover': {
      backgroundColor: colors.accentOrange
    },
    '.form-links': {
      display: 'flex',
      justifyContent: 'space-between',
      fontSize: vars.fontSizeSmall,
      marginTop: vars.spacingMain
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
