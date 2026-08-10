import type { CSSObject } from '@styles/index'
import * as colors from './_colors'
import * as vars from './_vars'

// the 1px delimiter border used for cards, avatars, and section rules
export const hairline = `${vars.borderWidthMain} solid ${colors.borderColor}`

// circular avatar image; callers add display/margin/border as needed
export function avatar(size: number): CSSObject {
  return {
    width: `${size}px`,
    height: `${size}px`,
    objectFit: 'cover',
    borderRadius: '50%',
    backgroundColor: colors.bgSurfaceLight
  }
}

// the orange call-to-action look shared by form submits, .primary-button, and .cta
export const accentButton: CSSObject = {
  backgroundColor: colors.accentOrange,
  color: colors.bgMain,
  fontWeight: '600'
}

// bordered surface shared by cards, forms, and dialogs
export const cardSurface: CSSObject = {
  backgroundColor: colors.bgSurface,
  border: hairline,
  borderRadius: vars.borderRadiusMain,
  padding: vars.spacingMain
}
