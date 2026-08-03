type NavigationProps = {
  isAuthenticated: boolean
}
const Navigation = (props: NavigationProps) => {
  const { isAuthenticated } = props
  return (
    <nav aria-label="Main">
      <button type="button" class="nav-toggle" aria-expanded="false" aria-controls="site-nav">
        &#8801;
      </button>
      <ul id="site-nav">
        <li>
          <a href="/">Home</a>
        </li>
        {!isAuthenticated && (
          <>
            <li>
              <a href="/sign-up">Sign up</a>
            </li>
            <li>
              <a href="/sign-in">Sign in</a>
            </li>
          </>
        )}
        {isAuthenticated && (
          <>
            <li>
              <a href="/user">User</a>
            </li>
            <li>
              <a href="/user/sign-out">Sign out</a>
            </li>
          </>
        )}
      </ul>
    </nav>
  )
}

export default Navigation
