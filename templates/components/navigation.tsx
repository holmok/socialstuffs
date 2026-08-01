const Navigation = () => {
  return (
    <nav aria-label="Main">
      <button type="button" class="nav-toggle" aria-expanded="false" aria-controls="site-nav">
        &#8801;
      </button>
      <ul id="site-nav">
        <li>
          <a href="/">Home</a>
        </li>
        <li>
          <a href="/about">About</a>
        </li>
      </ul>
    </nav>
  )
}

export default Navigation
