import type { CSSObject } from '@styles/index'
import * as colors from '../_colors'
import { accentButton, avatar, cardSurface, hairline } from '../_mixins'
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
  // roomier vertical padding for a ~40px touch target; negative margin keeps the strip height
  '.user-tab a': {
    display: 'block',
    padding: vars.spacingSmall,
    margin: `-${vars.spacingVerySmall} 0`,
    color: colors.fgMuted,
    fontSize: vars.fontSizeSmall,
    textDecoration: 'none',
    whiteSpace: 'nowrap',
    borderRadius: vars.borderRadiusSmall
  },
  // rendered as an h1 for the page outline; overrides the global h1 style to keep the old h2 look
  '.user-heading': {
    fontSize: '1.5em',
    letterSpacing: '-0.01em',
    lineHeight: '1.5',
    paddingBottom: '0',
    marginBottom: vars.spacingMid,
    textAlign: 'center'
  },
  '.profile-card': {
    ...cardSurface,
    maxWidth: vars.maxWidthForm,
    margin: '0 auto',
    textAlign: 'center'
  },
  '.profile-avatar': {
    ...avatar(192),
    display: 'block',
    margin: `0 auto ${vars.spacingMid}`
  },
  // rendered as an h1 for the page outline; overrides the global h1 style to keep the old h2 look
  // (the public profile page re-overrides these via .profile-side .profile-name)
  '.profile-name': {
    fontSize: '1.5em',
    letterSpacing: '-0.01em',
    lineHeight: '1.5',
    paddingBottom: '0',
    margin: `0 0 ${vars.spacingVerySmall}`
  },
  '.profile-username': {
    color: colors.fgMuted,
    fontSize: vars.fontSizeSmall,
    margin: `0 0 ${vars.spacingSmall}`
  },
  '.profile-meta': {
    color: colors.fgMutedMore,
    margin: `0 0 ${vars.spacingSmall}`
  },
  '.profile-bio': {
    textAlign: 'left',
    whiteSpace: 'pre-line',
    margin: `0 0 ${vars.spacingMid}`
  },
  '.profile-since': {
    color: colors.fgMuted,
    fontSize: vars.fontSizeSmall,
    margin: 0
  },
  '.profile-links': {
    display: 'flex',
    justifyContent: 'center',
    gap: vars.spacingSmall
  },
  '.profile-edit-link': {
    display: 'inline-block',
    marginTop: vars.spacingMid,
    padding: `${vars.spacingSmall} ${vars.spacingMain}`,
    backgroundColor: colors.bgSurfaceLight,
    color: colors.fgMain,
    fontSize: vars.fontSizeSmall,
    fontWeight: '500',
    borderRadius: vars.borderRadiusSmall,
    textDecoration: 'none'
  },
  '.profile-edit-link:hover': {
    backgroundColor: colors.borderColor
  },
  '.data-card': {
    maxWidth: vars.maxWidthForm,
    margin: `0 auto ${vars.spacingMain}`
  },
  // card headings are h2s for the page outline but keep the old h3 size
  '.data-card h2': {
    fontSize: '1.17em',
    marginBottom: vars.spacingSmall
  },
  // the action buttons sit centered in their cards
  '.data-card form': {
    textAlign: 'center'
  },
  '.data-card > .danger-button': {
    display: 'block',
    margin: '0 auto'
  },
  // stands out against the card surface (mirrors the .form submit style)
  '.primary-button': {
    ...accentButton
  },
  '.primary-button:hover': {
    backgroundColor: colors.fgAccent
  },
  '.data-card .form-indicator': {
    display: 'none',
    marginLeft: vars.spacingSmall,
    fontSize: vars.fontSizeSmall,
    color: colors.fgMuted
  },
  '.data-card .form-indicator.htmx-request': {
    display: 'inline'
  },
  '.data-export-link': {
    fontSize: vars.fontSizeSmall,
    marginBottom: vars.spacingMid,
    textAlign: 'center'
  },
  '.danger-card': {
    borderColor: colors.fgError
  },
  '.invite-list': {
    listStyle: 'none',
    margin: '0',
    padding: '0'
  },
  '.invite-row': {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: vars.spacingSmall,
    padding: `${vars.spacingSmall} 0`,
    borderBottom: hairline
  },
  '.invite-row:last-child': {
    borderBottom: 'none'
  },
  // long fixed-length codes: keep them selectable and readable on small screens
  '.invite-code': {
    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
    fontSize: vars.fontSizeSmall,
    letterSpacing: '0.05em',
    wordBreak: 'break-all',
    color: colors.fgMain
  },
  '.invite-refresh': {
    backgroundColor: colors.bgSurfaceLight,
    color: colors.fgMain,
    fontSize: vars.fontSizeSmall,
    padding: `${vars.spacingVerySmall} ${vars.spacingSmall}`,
    borderRadius: vars.borderRadiusSmall
  },
  '.invite-refresh:hover': {
    backgroundColor: colors.borderColor
  },
  '.invite-claimed-by': {
    color: colors.fgMuted,
    fontSize: vars.fontSizeSmall
  },
  '.invite-empty': {
    color: colors.fgMuted,
    fontSize: vars.fontSizeSmall,
    textAlign: 'center',
    margin: '0'
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
