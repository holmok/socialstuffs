import type { CSSObject } from '@styles/index'
import * as colors from '../_colors'
import * as vars from '../_vars'

export default {
  h1: {
    textAlign: 'center'
  },
  '.auth-form': {
    backgroundColor: colors.bgSurface,
    borderRadius: vars.borderRadiusMain,
    padding: vars.spacingMain,
    maxWidth: vars.maxWidthForm,
    margin: '0 auto'
  },
  '.auth-form label': {
    display: 'block',
    fontSize: vars.fontSizeSmall,
    color: colors.fgMuted,
    marginBottom: vars.spacingSmall
  },
  '.auth-form input': {
    display: 'block',
    width: '100%',
    backgroundColor: colors.bgMain,
    color: colors.fgMain,
    border: 'none',
    borderRadius: vars.borderRadiusMain,
    padding: vars.spacingSmall,
    marginBottom: vars.spacingMain
  },
  // autofilled inputs: browsers force their own background; an inset box-shadow is the only way to paint over it
  '.auth-form input:-webkit-autofill, .auth-form input:-webkit-autofill:hover, .auth-form input:-webkit-autofill:focus': {
    WebkitBoxShadow: `0 0 0 1000px ${colors.bgMain} inset`,
    WebkitTextFillColor: colors.fgMain,
    caretColor: colors.fgMain
  },
  '.auth-form input:autofill': {
    boxShadow: `0 0 0 1000px ${colors.bgMain} inset`
  },
  '.auth-form button': {
    width: '100%',
    backgroundColor: colors.accentBlue,
    color: colors.bgMain
  },
  '.auth-form button:hover': {
    backgroundColor: colors.fgMain
  },
  '.auth-links': {
    display: 'flex',
    justifyContent: 'space-between',
    fontSize: vars.fontSizeSmall,
    marginTop: vars.spacingMain
  },
  '.auth-alt': {
    textAlign: 'center',
    fontSize: vars.fontSizeSmall,
    color: colors.fgMuted,
    marginTop: vars.spacingMain,
    marginBottom: '0'
  }
} as CSSObject
