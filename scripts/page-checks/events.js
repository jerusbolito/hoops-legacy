// Runs inside the game's page, through the desktop self-check:
//   VITE_EXPOSE_STORE=1 npx vite build --outDir dist-test
//   HOOPS_DIST=dist-test node scripts/run-electron.mjs --smoke --smoke-engine=bundled-missing --smoke-eval=scripts/page-checks/events.js --smoke-out=result.json
// It plays the midseason contests and the draft combine the way a player would, and reports whether the page is still
// on screen after collecting each result. (A blank page here means the game crashed while drawing.)
(async () => {
  const store = window.__hoops;
  if (!store) return { error: 'This build does not expose the store. Build with VITE_EXPOSE_STORE=1.' };
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const alive = () => ({ rootChildren: document.getElementById('root').children.length, hasTabs: document.body.innerText.includes('This Week') });
  const out = {};

  await store.getState().newCareer({ firstName: 'Check', lastName: 'Contest', hometown: 'Oakland, CA', archetype: 'slasher', position: 'SG', heightIn: 76, schoolIndex: 0, traits: [], seed: 7 });
  const edit = (fn) =>
    store.setState((st) => {
      const g = structuredClone(st.game);
      fn(g);
      return { game: g, tab: 'hub' };
    });
  // qualify for the events: midseason of the regular season, with the ratings to be invited
  edit((g) => {
    g.career.phase = 'regular';
    g.career.week = Math.max(2, Math.floor(g.league.regularWeeks / 2));
    g.career.step = 'training';
    const a = g.athletes[g.player.athleteId];
    a.ratings.shooting = 92;
    a.ratings.athleticism = 92;
    a.ratings.finishing = 85;
  });
  await wait(300);
  out.start = alive();

  for (const id of ['skills_three', 'skills_dunk']) {
    store.getState().openEvent(id);
    await wait(400);
    for (let i = 0; i < 3 && !store.getState().contest?.finished; i++) {
      store.getState().playContest('balanced');
      await wait(300);
    }
    const c = store.getState().contest;
    out[id] = { finished: !!c?.finished, placement: c?.placement, beforeCollect: alive() };
    store.getState().finishContest();
    await wait(1500);
    out[id].afterCollect = alive();
  }

  edit((g) => {
    g.career.phase = 'draft';
  });
  store.getState().openEvent('combine');
  await wait(400);
  store.getState().runCombine('steady');
  await wait(300);
  out.combine = { beforeCollect: alive() };
  store.getState().finishCombine();
  await wait(1500);
  out.combine.afterCollect = alive();
  return out;
})()
