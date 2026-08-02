import Layout from '../layouts/main-layout'

interface AboutPageProps {
  description: string
}

const AboutPage = ({ description }: AboutPageProps) => {
  return (
    <Layout title="About" description={description} styles={['info']}>
      <div class="about">
        <section class="about-hero">
          <p class="eyebrow">Why socialstuffs exists</p>
          <h1>Remember when sharing was just sharing?</h1>
          <p class="lead">
            Somewhere along the way, social media stopped being about the people on it. Feeds got tuned by algorithms to keep you
            scrolling long after you stopped caring about what was in them. socialstuffs is a throwback to an earlier idea of the
            internet, where you shared stories, pictures, and links with people you knew, and then went on with your day.
          </p>
        </section>

        <section>
          <h2>The feed is not a slot machine of endless content</h2>
          <p>
            Feeds on other sites never end, and that's on purpose. Your home page shows the latest posts from the people you've
            favorited or approved, newest first, and when you hit the bottom, that's it. There is a link to older posts if you
            feel like digging.
          </p>
          <p>
            Nothing is ranked or recommended. If nobody you know has posted lately, then there is nothing new. It means you are
            caught up. Get on with your life.
          </p>
        </section>

        <section>
          <h2>No popularity contest</h2>
          <p>
            Posts here don't keep score. There are no likes, view counts, or share numbers, so there's nothing to chase and
            nothing to perform for. You're just writing for the people who'll read it.
          </p>
        </section>

        <section>
          <h2>How favorites work</h2>
          <p>
            Favorites are for the people you never want to miss, and you get ten of them. Go to someone's profile and hit the
            favorite button (hit it again if you change your mind). Their posts show up in your home feed, and you can address a
            post to your favorites only. The list is not ranked, and nobody gets notified when they are added or dropped.
          </p>
        </section>

        <section>
          <h2>How approving and disapproving work</h2>
          <p>
            Approving and disapproving covers everyone else. When you approve someone, their posts join your home feed, and they
            can see anything you share with people you approved. When you disapprove someone, posts you send to "everyone except
            people I disapprove" skip them. Both are just buttons on a profile. Click one to set it, click it again to take it
            back, or click the other one if you change your mind.
          </p>
          <p>
            You can rate up to a hundred people this way. This sounds low until you try to name a hundred people you actually
            know. Profiles do show how many approvals and disapprovals someone has collected. So when you are looking at a
            person's profile or your own, you can see how many approvals and disapprovals there are.
          </p>
        </section>

        <section>
          <h2>Who can see what</h2>
          <p>
            First things first: you have to be signed in to see anything at all. No post, profile, or picture on socialstuffs is
            visible to the open internet. Once you're in, every post has an audience that you pick when you write it:
          </p>
          <ul class="audience-list">
            <li>
              <strong>Drafts</strong>: nobody but you, until you publish.
            </li>
            <li>
              <strong>Everyone</strong>: every signed-in member. This is as public as socialstuffs gets.
            </li>
            <li>
              <strong>My favorites</strong>: just the people on your favorites list.
            </li>
            <li>
              <strong>People I approve</strong>: only the members you've approved.
            </li>
            <li>
              <strong>Everyone except people I disapprove</strong>: exactly what it says.
            </li>
          </ul>
          <p>
            Your own feed works the same way. It only ever contains you and the people you picked, and nobody can pay us to show
            up in it.
          </p>
        </section>

        <section>
          <h2>A post is words, one picture, one link</h2>
          <p>
            That's the whole format. It's enough to tell a story, show off a photo, or pass along something worth reading. If you
            have more pictures than that, well, put them somewhere else and include a link.
          </p>
        </section>

        <section>
          <h2>Where we use AI</h2>
          <p>
            We use AI for one thing. Every picture and every bit of text gets checked when it's posted, to catch rude, lewd, or
            mean stuff before anyone has to see it. No filter catches everything, but we try hard to keep this place safe and
            friendly.
          </p>
          <p>That's the AI's ONLY job here. It doesn't rank your feed, pick what you see, or study what you click.</p>
        </section>

        <section>
          <h2>Meeting new people</h2>
          <p>
            The Meet page is the only discovery feature we have. It shows the newest members, the most favorited and most approved
            people, and recent public posts. We don't scrape your contacts or guess at "people you may know." And you have to be
            signed in to see it.
          </p>
        </section>

        <section>
          <h2>Keeping it simple and safe</h2>
          <p>
            socialstuffs is plain old web pages. They load fast, work in any browser, and don't ask you to install an app or hand
            over your phone number. The simplicity is also what keeps it safe. Small circles, posts with picked audiences, a front
            door that requires signing in, and screening on everything that gets uploaded. There just isn't much machinery here
            that can be turned against you.
          </p>
        </section>

        <section>
          <h2>Your stuff is yours</h2>
          <p>
            You can download everything you've ever posted (profile, posts, pictures) as a single zip, any day you like (up to
            once a day). And if you decide to leave, deleting your account really deletes it. Posts, pictures, connections, all of
            it, wiped from our database and our storage. We don't keep a copy for our records, because they aren't our records.
          </p>
        </section>

        <section class="never">
          <h2>What you WILL NOT find here</h2>
          <ul>
            <li>An algorithm deciding what you see</li>
            <li>Targeted ads</li>
            <li>Likes, counts, and scoreboards</li>
            <li>Infinite scroll</li>
            <li>Auto-play anything</li>
            <li>People you may know</li>
            <li>Notifications begging you back</li>
            <li>Your data, for sale</li>
          </ul>
        </section>
      </div>
    </Layout>
  )
}

export default AboutPage
