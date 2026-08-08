import { describe, expect, it } from 'bun:test'
import SignInForm from './sign-in-form'
import SignUpForm from './sign-up-form'

const secret = 'S3cret!longpass'

describe('sign-up-form password disclosure', () => {
  it('does not echo the submitted password into the rendered HTML', () => {
    const html = SignUpForm({
      username: 'someuser',
      password: secret,
      confirmPassword: secret,
      errors: { password: ['x'] }
    }).toString()
    expect(html).not.toContain(secret)
  })

  it('still round-trips non-secret fields like username', () => {
    const html = SignUpForm({ username: 'someuser' }).toString()
    expect(html).toContain('someuser')
  })
})

describe('sign-in-form password disclosure', () => {
  it('does not echo the submitted password into the rendered HTML', () => {
    const html = SignInForm({ email: 'user@example.com', password: secret, errors: { password: ['x'] } }).toString()
    expect(html).not.toContain(secret)
  })

  it('still round-trips non-secret fields like email', () => {
    const html = SignInForm({ email: 'user@example.com' }).toString()
    expect(html).toContain('user@example.com')
  })
})
