const Footer = () => {
  return (
    <footer>
      <div class="footer-inner">
        <p class="copyright">© {new Date().getFullYear()} Bun + Hono + HTMX</p>
        <a class="back-to-top" href="#top">
          Back to top ↑
        </a>
      </div>
    </footer>
  )
}

export default Footer
