import Layout from '../layouts/main-layout'

interface ContactPageProps {
  description: string
}

const ContactPage = ({ description }: ContactPageProps) => {
  return (
    <Layout title="Contact Us" description={description} styles={['info']}>
      <h1>Contact Us</h1>
      <p>
        If you have any questions, feedback, or just want to say hello, feel free to reach out to us. We're happy to hear from you
        and will do our best to respond promptly. We are small and do this for the funsies, so your patience and understanding are
        appreciated.
      </p>
      <p>
        For general stuff, mail us at <a href="mailto:contact@socialstuffs.com">contact@socialstuffs.com</a>.
      </p>
      <p>
        To report an imposter, questionable content, or anything else that doesn't belong on socialstuffs, please reach out to{' '}
        <a href="mailto:report@socialstuffs.com">report@socialstuffs.com</a>.
      </p>
    </Layout>
  )
}

export default ContactPage
