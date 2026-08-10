type NavigationProps = {
  isAuthenticated: boolean
}
const Navigation = (props: NavigationProps) => {
  const { isAuthenticated } = props
  return (
    <nav aria-label="Main">
      <button type="button" class="nav-toggle" aria-label="Menu" aria-expanded="false" aria-controls="site-nav">
        <span aria-hidden="true">&#8801;</span>
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
              <a href="/discover">Discover</a>
            </li>
            <li>
              <a href="/posts/new">New Post</a>
            </li>
            <li>
              <a href="/user">My Stuff</a>
            </li>
            <li>
              <form method="post" action="/user/sign-out">
                <button type="submit">Sign out</button>
              </form>
            </li>
          </>
        )}
      </ul>
    </nav>
  )
}

export default Navigation
