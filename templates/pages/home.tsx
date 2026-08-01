import Layout from '../layouts/main-layout'

const HomePage = () => {
  return (
    <Layout title="Home">
      <h1>Home</h1>
      <p>Welcome to the Bun + Hono + HTMX example?</p>
      <p id="demo-area">
        <button type="button" hx-get="/clicked" hx-target="#demo-area" hx-swap="outerHTML">
          Click me!
        </button>
      </p>
    </Layout>
  )
}

export default HomePage
