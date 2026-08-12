import Navigation from '@components/navigation'

type HeaderProps = {
  isAuthenticated: boolean
  isAdmin?: boolean
}
const Header = ({ isAuthenticated, isAdmin = false }: HeaderProps) => {
  return (
    <header>
      <div class="header-inner">
        <a class="site-title" href="/">
          social<span>stuffs</span>
        </a>
        <Navigation isAuthenticated={isAuthenticated} isAdmin={isAdmin} />
      </div>
    </header>
  )
}

export default Header
