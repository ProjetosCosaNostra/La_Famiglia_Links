// BlackGold V19 build wrapper: preserve proven V18 build, then materialize V19 authority.
await import('./build-original.mjs');
await import('./v19.mjs');
