import type { CSSObject } from '@styles/index'
import * as colors from '../_colors'
import * as vars from '../_vars'

const hairline = `${vars.borderWidthMain} solid ${colors.borderColor}`

export default {
  '.profile-page': {
    display: 'grid',
    gridTemplateColumns: '280px 1fr',
    gap: vars.spacingMain,
    alignItems: 'start'
  },
  // re-asserts the h1 look here since user-style's .profile-name overrides it for the my-profile page
  '.profile-side .profile-name': {
    fontSize: vars.fontSizeMid,
    letterSpacing: '-0.02em',
    lineHeight: '1.2',
    paddingBottom: '0'
  },
  '#profile-actions': {
    marginTop: vars.spacingMid
  },
  '.profile-action-row': {
    display: 'flex',
    gap: vars.spacingSmall,
    marginBottom: vars.spacingSmall
  },
  '.profile-action-row form': {
    flex: '1'
  },
  '.profile-action': {
    width: '100%',
    backgroundColor: 'transparent',
    border: hairline,
    color: colors.fgMutedMore,
    fontSize: vars.fontSizeSmall,
    // roomier vertical padding for a ~40px touch target
    padding: vars.spacingSmall
  },
  '.profile-action:hover': {
    backgroundColor: colors.bgSurfaceLight,
    color: colors.fgMain
  },
  '.profile-action-approve': {
    borderColor: colors.fgSuccess,
    color: colors.fgSuccess
  },
  '.profile-action-disapprove': {
    borderColor: colors.fgError,
    color: colors.fgError
  },
  '.profile-action-favorite': {
    borderColor: colors.accentOrange,
    color: colors.fgAccent
  },
  '.profile-tallies': {
    display: 'flex',
    justifyContent: 'center',
    gap: vars.spacingMain,
    marginTop: vars.spacingMid
  },
  '.profile-tally': {
    display: 'flex',
    flexDirection: 'column'
  },
  '.profile-tally-count': {
    fontSize: vars.fontSizeMid,
    fontWeight: '600'
  },
  '.profile-tally-label': {
    fontSize: vars.fontSizeSmall,
    color: colors.fgMuted
  },
  '.profile-section h2': {
    fontSize: vars.fontSizeMid,
    marginBottom: vars.spacingSmall
  },
  '.profile-section-header': {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    gap: vars.spacingSmall
  },
  '.profile-new-post-link': {
    backgroundColor: colors.bgSurface,
    color: colors.fgMain,
    fontSize: vars.fontSizeSmall,
    fontWeight: '500',
    padding: `${vars.spacingVerySmall} ${vars.spacingSmall}`,
    borderRadius: vars.borderRadiusSmall,
    textDecoration: 'none',
    whiteSpace: 'nowrap'
  },
  '.profile-new-post-link:hover': {
    backgroundColor: colors.bgSurfaceLight
  },
  '.profile-section + .profile-section': {
    marginTop: vars.spacingMain
  },
  '.profile-empty': {
    color: colors.fgMuted,
    fontSize: vars.fontSizeSmall
  },
  '.profile-favorites': {
    display: 'flex',
    flexWrap: 'wrap',
    gap: vars.spacingSmall,
    listStyle: 'none',
    margin: '0',
    padding: '0'
  },
  '.profile-favorites a': {
    display: 'block',
    lineHeight: '0',
    borderRadius: '50%'
  },
  '.profile-favorite-avatar': {
    width: '48px',
    height: '48px',
    objectFit: 'cover',
    borderRadius: '50%',
    backgroundColor: colors.bgSurfaceLight,
    border: hairline
  },
  '.profile-favorites a:hover .profile-favorite-avatar': {
    borderColor: colors.accentOrange
  },
  '.profile-post': {
    padding: `${vars.spacingMid} 0`,
    borderTop: hairline
  },
  '.profile-post:first-of-type': {
    borderTop: 'none',
    paddingTop: '0'
  },
  '.profile-post-image-link': {
    display: 'block',
    lineHeight: '0',
    cursor: 'zoom-in'
  },
  // tall images fill the column width and crop to their vertical middle
  '.profile-post-image': {
    display: 'block',
    width: '100%',
    maxHeight: '400px',
    objectFit: 'cover',
    borderRadius: vars.borderRadiusSmall,
    marginBottom: vars.spacingSmall,
    backgroundColor: colors.bgSurfaceLight
  },
  '.profile-post-content': {
    whiteSpace: 'pre-line',
    marginBottom: vars.spacingSmall
  },
  '.profile-post-link': {
    marginBottom: vars.spacingSmall
  },
  '.profile-post-date': {
    fontSize: vars.fontSizeSmall,
    color: colors.fgMuted,
    margin: '0'
  },
  '.profile-post-footer': {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    gap: vars.spacingSmall
  },
  '.profile-post-edit': {
    fontSize: vars.fontSizeSmall
  },
  '.profile-pagination': {
    display: 'flex',
    justifyContent: 'center',
    gap: vars.spacingSmall,
    marginTop: vars.spacingMid,
    paddingTop: vars.spacingMid,
    borderTop: hairline
  },
  // button-styled to match the New Post link so the paging controls read as controls
  '.profile-pagination a': {
    display: 'inline-block',
    backgroundColor: colors.bgSurface,
    color: colors.fgMain,
    fontSize: vars.fontSizeSmall,
    fontWeight: '500',
    // roomier vertical padding for a ~40px touch target
    padding: `${vars.spacingSmall} ${vars.spacingMid}`,
    borderRadius: vars.borderRadiusSmall,
    textDecoration: 'none'
  },
  '.profile-pagination a:hover': {
    backgroundColor: colors.bgSurfaceLight
  },
  [`@media (max-width: ${vars.breakpointMobile})`]: {
    '.profile-page': {
      gridTemplateColumns: '1fr'
    }
  }
} as CSSObject
