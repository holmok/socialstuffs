import type { CSSObject } from '@styles/index'
import * as colors from '../_colors'
import { avatar, hairline } from '../_mixins'
import * as vars from '../_vars'

export default {
  '.post-page': {
    maxWidth: '640px',
    margin: '0 auto'
  },
  '.post-comments': {
    marginTop: vars.spacingMain,
    paddingTop: vars.spacingMid,
    borderTop: hairline
  },
  '.post-comments h2': {
    fontSize: vars.fontSizeMid,
    marginBottom: vars.spacingSmall
  },
  '.comment-list': {
    listStyle: 'none',
    margin: '0',
    padding: '0'
  },
  '.comment': {
    display: 'flex',
    alignItems: 'flex-start',
    gap: vars.spacingSmall,
    padding: `${vars.spacingSmall} 0`,
    borderTop: hairline
  },
  '.comment:first-of-type': {
    borderTop: 'none',
    paddingTop: '0'
  },
  '.comment-author': {
    display: 'block',
    lineHeight: '0',
    borderRadius: '50%'
  },
  '.comment-author-avatar': {
    ...avatar(28),
    border: hairline
  },
  '.comment-author:hover .comment-author-avatar': {
    borderColor: colors.accentOrange
  },
  '.comment-body': {
    flex: '1',
    minWidth: '0'
  },
  '.comment-content': {
    whiteSpace: 'pre-line',
    marginBottom: vars.spacingVerySmall
  },
  '.comment-meta': {
    fontSize: vars.fontSizeSmall,
    color: colors.fgMuted,
    margin: '0'
  },
  '.comment-form': {
    marginTop: vars.spacingMid
  },
  '.comment-limit': {
    color: colors.fgMuted,
    fontSize: vars.fontSizeSmall,
    marginTop: vars.spacingMid
  }
} as CSSObject
