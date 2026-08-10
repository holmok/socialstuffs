import { describe, expect, test } from 'bun:test'
import getStyle, { type CSSObject, renderCSS } from '@styles/index'

describe('renderCSS', () => {
  test('camelCase properties render as kebab-case', () => {
    const css = renderCSS({ '.a': { backgroundColor: 'red', textAlign: 'center' } } as CSSObject)
    expect(css).toBe('.a { background-color: red; text-align: center; }')
  })

  test('vendor-prefixed properties keep their leading dash', () => {
    const css = renderCSS({ '.a': { WebkitFontSmoothing: 'antialiased' } } as CSSObject)
    expect(css).toBe('.a { -webkit-font-smoothing: antialiased; }')
  })

  test('bare numbers render as px, zero stays 0', () => {
    const css = renderCSS({ '.a': { marginTop: 4, padding: 0 } } as CSSObject)
    expect(css).toBe('.a { margin-top: 4px; padding: 0; }')
  })

  test('nested selector objects flatten to descendant selectors, not native nesting', () => {
    const css = renderCSS({
      '.form': {
        maxWidth: '30rem',
        label: { display: 'block' },
        'input:focus': { outline: 'none' }
      }
    } as CSSObject)
    expect(css).toBe('.form { max-width: 30rem; } .form label { display: block; } .form input:focus { outline: none; }')
  })

  test('deeply nested selectors concatenate the full path', () => {
    const css = renderCSS({ '.a': { '.b': { '.c:hover': { color: 'red' } } } } as CSSObject)
    expect(css).toBe('.a .b .c:hover { color: red; }')
  })

  test('comma lists expand to their cross product', () => {
    const css = renderCSS({ '.a, .b': { 'x, y': { color: 'red' } } } as CSSObject)
    expect(css).toBe('.a x, .a y, .b x, .b y { color: red; }')
  })

  test('at-rules keep wrapping their contents as blocks with flat selectors inside', () => {
    const css = renderCSS({
      '@media (max-width: 600px)': {
        '.a': { display: 'none', '.b': { color: 'red' } }
      }
    } as CSSObject)
    expect(css).toBe('@media (max-width: 600px) { .a { display: none; } .a .b { color: red; } }')
  })

  test('at-rules nested inside a selector keep the selector path', () => {
    const css = renderCSS({
      '.a': {
        color: 'blue',
        '@media (max-width: 600px)': { color: 'red' }
      }
    } as CSSObject)
    expect(css).toBe('.a { color: blue; } @media (max-width: 600px) { .a { color: red; } }')
  })

  test('undefined values are skipped', () => {
    const css = renderCSS({ '.a': { color: undefined, display: 'block' } } as CSSObject)
    expect(css).toBe('.a { display: block; }')
  })
})

describe('getStyle', () => {
  test('combines styles in order and matches concatenation of the parts', () => {
    const combined = getStyle(['reset', 'global'])
    expect(combined).toBe(getStyle(['reset']) + getStyle(['global']))
  })

  test('repeated calls return the cached combination', () => {
    expect(getStyle(['reset', 'auth'])).toBe(getStyle(['reset', 'auth']))
  })

  test('every registered style renders without native nesting inside rule bodies', () => {
    for (const name of ['global', 'reset', 'auth', 'info', 'error', 'user', 'profile', 'home', 'post'] as const) {
      // strip at-rule wrappers (the one legitimate block-in-block construct), then no `{` may
      // appear again before the matching `}` of any rule
      const css = getStyle([name]).replace(/@[^{]+\{/g, '')
      expect(css).not.toMatch(/\{[^{}]*\{/)
    }
  })
})
