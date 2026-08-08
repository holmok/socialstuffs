import { describe, expect, it } from 'bun:test'
import Navigation from './navigation'
import ResendValidationForm from './resend-validation-form'
import SignInForm from './sign-in-form'
import SignUpForm from './sign-up-form'
import TextInput from './text-input'

describe('form progressive-enhancement fallback', () => {
  it('sign-in form has native action/method alongside hx-post', () => {
    const html = SignInForm({}).toString()
    expect(html).toContain('action="/sign-in"')
    expect(html).toContain('method="post"')
    expect(html).toContain('hx-post="/sign-in"')
  })

  it('sign-up form has native action/method alongside hx-post', () => {
    const html = SignUpForm({}).toString()
    expect(html).toContain('action="/sign-up"')
    expect(html).toContain('method="post"')
    expect(html).toContain('hx-post="/sign-up"')
  })

  it('resend-validation form has native action/method alongside hx-post', () => {
    const html = ResendValidationForm({}).toString()
    expect(html).toContain('action="/resend-validation"')
    expect(html).toContain('method="post"')
    expect(html).toContain('hx-post="/resend-validation"')
  })
})

describe('autocomplete hints', () => {
  it('sign-in password uses current-password', () => {
    const html = SignInForm({}).toString()
    expect(html).toContain('autocomplete="current-password"')
    expect(html).toContain('autocomplete="email"')
  })

  it('sign-up passwords use new-password', () => {
    const html = SignUpForm({}).toString()
    expect(html).toContain('autocomplete="new-password"')
    expect(html).toContain('autocomplete="username"')
  })
})

describe('request-feedback wiring', () => {
  it('each form disables the button and shows an indicator during flight', () => {
    for (const html of [SignInForm({}).toString(), SignUpForm({}).toString(), ResendValidationForm({}).toString()]) {
      expect(html).toContain('hx-disabled-elt="find button"')
      expect(html).toContain('hx-indicator="find .form-indicator"')
      expect(html).toContain('class="form-indicator"')
    }
  })
})

describe('accessibility associations', () => {
  it('errored TextInput links the input to its error list', () => {
    const html = String(TextInput({ id: 'email', name: 'email', label: 'Email', errors: ['Required'] }))
    expect(html).toContain('aria-invalid="true"')
    expect(html).toContain('aria-describedby="email-errors"')
    expect(html).toContain('id="email-errors"')
  })

  it('clean TextInput omits aria-invalid/aria-describedby', () => {
    const html = String(TextInput({ id: 'email', name: 'email', label: 'Email' }))
    expect(html).not.toContain('aria-invalid')
    expect(html).not.toContain('aria-describedby')
  })

  it('form-errors container is a live alert region', () => {
    const html = SignInForm({ errors: { form: ['Something went wrong'] } }).toString()
    expect(html).toContain('class="form-errors"')
    expect(html).toContain('role="alert"')
  })

  it('nav toggle has an accessible name', () => {
    const html = Navigation({ isAuthenticated: false }).toString()
    expect(html).toContain('aria-label="Menu"')
  })
})
