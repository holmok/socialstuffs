const Footer = () => {
  return (
    <footer>
      <div class="footer-inner">
        <p class="copyright">© {new Date().getFullYear()} socialstuffs</p>
        <span class="footer-links">
          <a href="/about">About</a> {' · '}
          <a href="/contact">Contact</a> {' · '}
          <a href="/terms">Terms</a> {' · '}
          <a href="/privacy">Privacy</a>
        </span>
        <a class="back-to-top" href="#top">
          Up ↑
        </a>
      </div>
    </footer>
  )
}

export default Footer
