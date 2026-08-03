import Navigation from '@components/navigation'

type HeaderProps = {
  isAuthenticated: boolean
}
const Header = ({ isAuthenticated }: HeaderProps) => {
  return (
    <header>
      <div class="header-inner">
        <a class="site-title" href="/">
          social<span>stuffs</span>
        </a>
        <Navigation isAuthenticated={isAuthenticated} />
      </div>
    </header>
  )
}

export default Header
