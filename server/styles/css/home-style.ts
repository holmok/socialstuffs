import type { CSSObject } from '@styles/index'
import * as colors from '../_colors'
import { avatar, cardSurface, hairline } from '../_mixins'
import * as vars from '../_vars'

export default {
  '.home-user': {
    maxWidth: '640px',
    margin: '0 auto'
  },
  '.home-user h1': {
    fontSize: vars.fontSizeMid,
    marginBottom: vars.spacingMid
  },
  '.feed-post': {
    display: 'flex',
    alignItems: 'flex-start',
    gap: vars.spacingSmall
  },
  '.feed-author': {
    display: 'block',
    lineHeight: '0',
    borderRadius: '50%'
  },
  '.feed-author-avatar': {
    ...avatar(36),
    border: hairline
  },
  '.feed-author:hover .feed-author-avatar': {
    borderColor: colors.accentOrange
  },
  // the post body must be allowed to shrink or a wide image link forces the row past the column
  '.feed-post-body': {
    flex: '1',
    minWidth: '0'
  },
  // callout pointing circle-less users at /discover
  '.feed-cta': {
    ...cardSurface,
    padding: vars.spacingMid,
    marginBottom: vars.spacingMid,
    fontSize: vars.fontSizeSmall,
    color: colors.fgMuted
  },
  '.discover-note': {
    fontSize: vars.fontSizeSmall,
    color: colors.fgMuted,
    marginBottom: vars.spacingMid
  }
} as CSSObject
