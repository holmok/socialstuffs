import Layout from '../layouts/main-layout'

interface HomePageProps {
  description: string
}

const HomePage = ({ description }: HomePageProps) => {
  return (
    <Layout title="Home" description={description}>
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
