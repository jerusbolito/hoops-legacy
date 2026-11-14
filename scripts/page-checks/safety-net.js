// Runs inside the game's page, through the desktop self-check (see events.js for how). It breaks things ON PURPOSE to
// prove the safety nets work: a broken pop-up must close itself, and a broken screen must show a recovery screen
// instead of a blank page. The console errors this causes are expected, so a run of this script is judged by its
// result, not by "ok".
(async () => {
  const store = window.__hoops;
  if (!store) return { error: 'This build does not expose the store. Build with VITE_EXPOSE_STORE=1.' };
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const alive = () => ({ rootChildren: document.getElementById('root').children.length, hasTabs: document.body.innerText.includes('This Week') });
  const out = {};

  await store.getState().newCareer({ firstName: 'Check', lastName: 'Net', hometown: 'Oakland, CA', archetype: 'slasher', position: 'SG', heightIn: 76, schoolIndex: 0, traits: [], seed: 9 });
  await wait(300);
  out.start = alive();

  // 1. a pop-up that cannot be drawn (a contest with no entrants) should close itself and leave the game on screen
  store.setState({ eventId: 'skills_three', contest: { eventId: 'skills_three', seed: 1, round: 1, entrants: null, finished: false, notes: [] } });
  await wait(1200);
  out.brokenPopup = { eventClosedItself: store.getState().eventId === null, ...alive(), toldThePlayer: document.body.innerText.includes('had a problem') };

  // 2. a whole screen that cannot be drawn should show the recovery screen, not a blank page
  const good = store.getState().game;
  store.setState({ game: { ...good, career: null } });
  await wait(800);
  out.brokenScreen = { rootChildren: document.getElementById('root').children.length, showsRecoveryScreen: document.body.innerText.includes('Something went wrong'), saysCareerIsSafe: document.body.innerText.includes('Your career is safe') };

  // 3. once the problem is gone, "Try again" brings the game back
  store.setState({ game: good });
  [...document.querySelectorAll('button')].find((b) => b.textContent.includes('Try again'))?.click();
  await wait(800);
  out.recovered = alive();
  return out;
})()
