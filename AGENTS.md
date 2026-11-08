# Working on this straw

Read README.md and DESIGN.md first. Keep this a small, inspectable concept demonstrator.
If a local DESK.md exists, read it; otherwise the repository documentation is sufficient.
Run `node --test` after changing the state model. Keep the demo usable by opening index.html offline.
Preserve the distinction between the originator's intent, proposed adapters, and verified behavior.
Do not turn simulated settlement into a claim of real settlement. The original offline demo must remain a simulation. The separate Devnet app may connect Phantom and issue test tokens only, per the user's 2026-11-06 authorization. Never use mainnet, existing personal signing keys, or real assets for this prototype. Keep all deployment keypairs in ignored private/ and never commit them.
The main v0.3 Devnet rule is a cumulative 10 Kusa per wallet across all communities per JST day, minting 90 WARA to the shop and 10 to the customer per Kusa. Preserve the independent historical 300-limit instructions used by /devnet/. Do not replenish spent capacity during the same day. Test the on-chain program, authorization, replay rejection, and day boundaries before pushing changes.
