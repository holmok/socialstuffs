import type { CSSObject } from '@styles/index'
import * as colors from '../_colors'
import * as vars from '../_vars'

export default {
  html: {
    backgroundColor: colors.bgMain,
    color: colors.fgMain,
    fontFamily: vars.fontMain
  },
  p: {
    fontSize: vars.spacingMain,
    lineHeight: vars.spacingMain,
    marginBottom: vars.spacingMain
  },
  button: {
    border: 'none',
    backgroundColor: colors.bgSurface,
    color: colors.fgMuted,
    padding: `${vars.spacingSmall} ${vars.spacingMain}`,
    fontSize: vars.fontMain,
    borderRadius: vars.borderRadiusMain,
    cursor: 'pointer'
  },
  main: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: '100vh'
  },
  'nav ul': {
    display: 'flex',
    gap: vars.spacingMain,
    listStyle: 'none',
    padding: '0',
    backgroundColor: colors.bgSurface,
    a: {
      color: colors.fgMain,
      textDecoration: 'none'
    }
  }
} as CSSObject
