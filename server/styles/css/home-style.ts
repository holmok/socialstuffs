import type { CSSObject } from '@styles/index'
import * as colors from '../_colors'
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
    width: '36px',
    height: '36px',
    objectFit: 'cover',
    borderRadius: '50%',
    backgroundColor: colors.bgSurfaceLight,
    border: `${vars.borderWidthMain} solid ${colors.borderColor}`
  },
  '.feed-author:hover .feed-author-avatar': {
    borderColor: colors.accentOrange
  },
  // the post body must be allowed to shrink or a wide image link forces the row past the column
  '.feed-post-body': {
    flex: '1',
    minWidth: '0'
  }
} as CSSObject
