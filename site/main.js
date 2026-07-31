/* Hero demo: re-enacts follow mode. A fake "voice" reads the script at an
   uneven human pace, goes off-script once (the prompter waits), then resumes.
   Everything degrades to a static lit frame under prefers-reduced-motion. */

const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches

// ---------- scroll reveals ----------
const revealEls = document.querySelectorAll('.reveal')
if (reduced) {
  revealEls.forEach((el) => el.classList.add('in'))
} else {
  const io = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        if (e.isIntersecting) {
          e.target.classList.add('in')
          io.unobserve(e.target)
        }
      }
    },
    { threshold: 0.12 }
  )
  revealEls.forEach((el) => io.observe(el))
}

// ---------- nav border ----------
const nav = document.getElementById('nav')
addEventListener('scroll', () => nav.classList.toggle('scrolled', scrollY > 24), { passive: true })

// ---------- demo ----------
const SCRIPT =
  'Good evening, and welcome. This page is the demo: the highlight you are ' +
  'watching is how LattePrompter reads along with you. Speed up. Slow down. ' +
  'Stop to make a joke that is nowhere in the script. § When you find your ' +
  'line again, so does the prompter.'

const scrollEl = document.getElementById('demo-scroll')
const stage = scrollEl.parentElement
const chip = document.getElementById('demo-chip')
const chipLabel = document.getElementById('demo-chip-label')
const meter = document.getElementById('demo-meter')

// '§' marks the off-script pause; it renders nothing.
const tokens = SCRIPT.split(' ').map((t) => ({ word: t === '§' ? null : t, pause: t === '§' }))
for (const t of tokens) {
  if (!t.word) continue
  t.el = document.createElement('span')
  t.el.className = 'w'
  t.el.textContent = t.word + ' '
  scrollEl.appendChild(t.el)
}

const BARS = 22
const bars = []
for (let i = 0; i < BARS; i++) {
  const b = document.createElement('span')
  meter.appendChild(b)
  bars.push(b)
}

let speaking = true

function meterTick() {
  for (const b of bars) {
    const h = speaking ? 12 + Math.random() * 76 : 6 + Math.random() * 8
    b.style.height = h.toFixed(0) + '%'
  }
}

function centerOn(el) {
  const target = el.offsetTop + el.offsetHeight / 2 - stage.clientHeight * 0.48
  scrollEl.style.transform = `translateY(${-Math.max(0, target)}px)`
}

function delayFor(word) {
  let d = 175 + Math.random() * 130
  if (/[.:!?]$/.test(word)) d += 420
  else if (/,$/.test(word)) d += 190
  return d
}

function runDemo() {
  const words = tokens.filter((t) => t.el)
  let i = 0

  function step() {
    if (i > 0) {
      words[i - 1].el.classList.remove('now')
      words[i - 1].el.classList.add('read')
    }
    if (i >= words.length) {
      setTimeout(reset, 2600)
      return
    }
    const t = words[i]
    t.el.classList.add('now')
    centerOn(t.el)

    // the token *after* this word may be the off-script break
    const next = tokens[tokens.indexOf(t) + 1]
    let wait = delayFor(t.word)
    i++
    if (next && next.pause) {
      speaking = false
      chip.classList.add('waiting')
      chipLabel.textContent = 'waiting for you'
      setTimeout(() => {
        speaking = true
        chip.classList.remove('waiting')
        chipLabel.textContent = 'listening'
        step()
      }, 2900)
      return
    }
    setTimeout(step, wait)
  }

  function reset() {
    for (const w of words) w.el.classList.remove('now', 'read')
    scrollEl.style.transition = 'none'
    scrollEl.style.transform = 'translateY(0)'
    // eslint-disable-next-line no-unused-expressions
    scrollEl.offsetHeight
    scrollEl.style.transition = ''
    i = 0
    setTimeout(step, 900)
  }

  step()
}

if (reduced) {
  // static frame: first half read, one live word, calm meter
  const words = tokens.filter((t) => t.el)
  const mid = Math.floor(words.length * 0.45)
  words.slice(0, mid).forEach((t) => t.el.classList.add('read'))
  words[mid].el.classList.add('now')
  centerOn(words[mid].el)
  bars.forEach((b, idx) => (b.style.height = 14 + 60 * Math.abs(Math.sin(idx * 0.9)) + '%'))
} else {
  setInterval(meterTick, 95)
  meterTick()
  runDemo()
}
