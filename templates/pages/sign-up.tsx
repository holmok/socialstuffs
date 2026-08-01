import Layout from '../layouts/main-layout'

interface SignUpPageProps {
  description: string
}

const SignUpPage = ({ description }: SignUpPageProps) => {
  return (
    <Layout title="Sign Up" description={description} styles={['auth']}>
      <h1>Sign Up</h1>
      <form class="auth-form" method="post" action="/sign-up">
        <label for="username">Username</label>
        <input type="text" id="username" name="username" autocomplete="username" required />
        <label for="email">Email</label>
        <input type="email" id="email" name="email" autocomplete="email" required />
        <label for="confirm-email">Confirm email</label>
        <input type="email" id="confirm-email" name="confirmEmail" autocomplete="email" required />
        <label for="password">Password</label>
        <input type="password" id="password" name="password" autocomplete="new-password" required />
        <label for="confirm-password">Confirm password</label>
        <input type="password" id="confirm-password" name="confirmPassword" autocomplete="new-password" required />
        <button type="submit">Sign Up</button>
        <p class="auth-alt">
          Already signed up? <a href="/sign-in">Sign In</a>
        </p>
      </form>
    </Layout>
  )
}

export default SignUpPage
