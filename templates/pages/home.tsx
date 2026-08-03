const HomePage = () => {
  return (
    <div class="home-anon">
      <section class="hero">
        <p class="eyebrow">A Better Social Site</p>
        <h1>
          Share your <span class="stuff">stuffs</span> socially with people, not an algorithm.
        </h1>
        <p class="tagline">
          socialstuffs is a simple place to post things for the people you choose. There&rsquo;s no ranking machine deciding what
          you see, and no advertisers looking over your shoulder.
        </p>
        <div class="hero-actions">
          <a class="cta" href="/sign-up">
            Create your account
          </a>
          <a class="cta quiet" href="/sign-in">
            Sign in
          </a>
        </div>
      </section>

      <section class="pitch">
        <div class="pitch-header">
          <h2>What's Special?</h2>
          <span class="pitch-note">Eight things, NO fine print</span>
        </div>
        <ul class="pitch-list">
          <li>
            <h3>No algorithm</h3>
            <p>
              Your feed is just the people you picked, newest post first. Nothing gets ranked, promoted, or
              &ldquo;suggested.&rdquo;
            </p>
          </li>
          <li>
            <h3>No targeted ads</h3>
            <p>
              We don't follow you around the internet, and we don't sell your activity or data. We don't promote posts or show
              ads.
            </p>
          </li>
          <li>
            <h3>Your circle</h3>
            <p>
              Favorite the people you never want to miss, approve the ones you trust, disapprove of any annoying folks. The whole
              site is built around people you actually know and want to connect with.
            </p>
          </li>
          <li>
            <h3>You choose who sees each post</h3>
            <p>Each post can go to everyone, just your favorites, or only the people you've approved.</p>
          </li>
          <li>
            <h3>Kept safe and friendly</h3>
            <p>
              Every post and picture gets screened to catch rude, lewd, or mean stuff before anyone has to see it. And nothing
              here is visible to the open internet. You have to be signed in to see anything at all.
            </p>
          </li>
          <li>
            <h3>Your stuff is yours</h3>
            <p>Download everything you've posted (words, pictures, your profile) as one zip whenever you like.</p>
          </li>
          <li>
            <h3>Delete means deleted</h3>
            <p>
              If you delete your account, your data actually gets erased from our database and our storage. We don't archive it or
              hide it behind a "deactivated" flag.
            </p>
          </li>
          <li>
            <h3>No legalese</h3>
            <p>
              Our <a href="/terms">Terms</a> and <a href="/privacy">Privacy Policy</a> do not require a law degree to understand.
            </p>
          </li>
        </ul>
      </section>

      <section class="closing">
        <p>
          Want the longer story? It's on the <a href="/about">about page</a>.
        </p>
        <a class="cta" href="/sign-up">
          Join socialstuffs
        </a>
      </section>
    </div>
  )
}

export default HomePage
