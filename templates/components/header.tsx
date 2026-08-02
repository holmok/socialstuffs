import Navigation from '@components/navigation'

const Header = () => {
  return (
    <header>
      <div class="header-inner">
        <a class="site-title" href="/">
          social<span>stuffs</span>
        </a>
        <Navigation />
      </div>
    </header>
  )
}

export default Header
