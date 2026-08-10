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
  '.form-note': {
    fontSize: vars.fontSizeSmall,
    color: colors.fgMuted,
    marginBottom: vars.spacingMid
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
    backgroundColor: colors.bgSurface,
    border: `${vars.borderWidthMain} solid ${colors.borderColor}`,
    borderRadius: vars.borderRadiusMain,
    padding: vars.spacingMain,
    maxWidth: vars.maxWidthForm,
    margin: '0 auto',
    textAlign: 'center'
  },
  '.profile-avatar': {
    display: 'block',
    width: '192px',
    height: '192px',
    objectFit: 'cover',
    borderRadius: '50%',
    margin: `0 auto ${vars.spacingMid}`,
    backgroundColor: colors.bgSurfaceLight
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
    backgroundColor: colors.accentOrange,
    color: colors.bgMain,
    fontWeight: '600'
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
  '.delete-modal': {
    backgroundColor: colors.bgSurface,
    color: colors.fgMain,
    border: `${vars.borderWidthMain} solid ${colors.borderColor}`,
    borderRadius: vars.borderRadiusMain,
    padding: vars.spacingMain,
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
  '.user-tab a:hover': {
    color: colors.fgMain
  },
  '.user-tab.active a': {
    backgroundColor: colors.bgSurface,
    color: colors.fgMain,
    fontWeight: '500'
  }
} as CSSObject
