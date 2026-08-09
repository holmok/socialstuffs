import type { CSSObject } from '@styles/index'
import * as colors from '../_colors'
import * as vars from '../_vars'

export default {
  '.user-tabs': {
    marginTop: `-${vars.spacingVerySmall}`,
    marginBottom: vars.spacingSmall
  },
  '.user-tabs-list': {
    display: 'flex',
    justifyContent: 'center',
    flexWrap: 'wrap',
    gap: vars.spacingVerySmall,
    listStyle: 'none',
    margin: '0',
    padding: '0'
  },
  '.user-tab a': {
    display: 'block',
    padding: `${vars.spacingVerySmall} ${vars.spacingSmall}`,
    color: colors.fgMuted,
    fontSize: vars.fontSizeSmall,
    textDecoration: 'none',
    whiteSpace: 'nowrap',
    borderRadius: vars.borderRadiusSmall
  },
  '.form-note': {
    fontSize: vars.fontSizeSmall,
    color: colors.fgMuted,
    marginBottom: vars.spacingMid
  },
  '.user-heading': {
    marginBottom: vars.spacingMid,
    textAlign: 'center'
  },
  '.user-tab a:hover': {
    color: colors.fgMain
  },
  '.user-tab.active a': {
    backgroundColor: colors.bgSurface,
    color: colors.fgMain,
    fontWeight: '500'
  }
} as CSSObject
