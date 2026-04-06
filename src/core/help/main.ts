import { initLayout } from '../shared/initLayout'

initLayout()

function initInPageNav(): void {
  const nav = document.getElementById('help-in-page-nav')
  const content = document.querySelector('.usa-in-page-nav-container__main')
  if (!nav || !content) return

  const headings = content.querySelectorAll<HTMLHeadingElement>('h2, h3')
  if (headings.length === 0) return

  // Ensure each heading has an id for anchor links
  headings.forEach((h, i) => {
    if (!h.id) {
      h.id = `section-${i}`
    }
  })

  // Build nav list
  const ul = document.createElement('ul')
  ul.className = 'usa-in-page-nav__list'

  // When a nav link is clicked, lock highlighting to that item until the user
  // manually scrolls (wheel / touch), at which point scroll-based tracking resumes.
  let lockedId: string | null = null

  headings.forEach((h) => {
    const li = document.createElement('li')
    li.className = `usa-in-page-nav__item${h.tagName === 'H3' ? ' usa-in-page-nav__item--sub-item' : ''}`

    const a = document.createElement('a')
    a.href = `#${h.id}`
    a.className = 'usa-in-page-nav__link'
    a.textContent = h.textContent
    a.addEventListener('click', (e) => {
      e.preventDefault()
      lockedId = h.id
      h.scrollIntoView({ behavior: 'smooth' })
      history.replaceState(null, '', `#${h.id}`)
      setActive(h.id)
    })

    li.appendChild(a)
    ul.appendChild(li)
  })

  nav.appendChild(ul)

  // Release the click-lock when the user initiates a real scroll gesture.
  function releaseLock(): void {
    lockedId = null
  }
  window.addEventListener('wheel', releaseLock, { passive: true })
  window.addEventListener('touchmove', releaseLock, { passive: true })

  // Highlight the last heading that has scrolled past the top of the viewport.
  const links = ul.querySelectorAll<HTMLAnchorElement>('.usa-in-page-nav__link')
  const OFFSET = 120 // account for sticky header height

  function setActive(id: string): void {
    links.forEach((link) => link.classList.remove('usa-current'))
    ul.querySelector<HTMLAnchorElement>(`a[href="#${id}"]`)?.classList.add('usa-current')
  }

  function updateActive(): void {
    if (lockedId) {
      setActive(lockedId)
      return
    }
    let activeId = headings[0].id
    for (const h of headings) {
      if (h.getBoundingClientRect().top <= OFFSET) {
        activeId = h.id
      }
    }
    setActive(activeId)
  }

  window.addEventListener('scroll', updateActive, { passive: true })
  updateActive()
}

initInPageNav()
