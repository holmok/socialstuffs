import Layout from '../layouts/main-layout'

interface SignInPageProps {
  description: string
}

const SignInPage = ({ description }: SignInPageProps) => {
  return (
    <Layout title="Sign in" description={description} styles={['auth']}>
      <h1>Sign In</h1>
      <form class="auth-form" method="post" action="/sign-in">
        <label for="email">Email</label>
        <input type="email" id="email" name="email" autocomplete="email" required />
        <label for="password">Password</label>
        <input type="password" id="password" name="password" autocomplete="current-password" required />
        <button type="submit">Sign In</button>
        <div class="auth-links">
          <a href="/recover-password">Forgot your password?</a>
          <a href="/sign-up">Sign Up</a>
        </div>
      </form>
    </Layout>
  )
}

export default SignInPage
