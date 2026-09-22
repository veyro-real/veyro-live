-- Live by default.
--
-- Paper was the safe default for a first build, but it is not what protects
-- anyone: every live spend still has to pass veyro_claim_spend against the
-- user's limits, then a balance check, then a confirmation tap. A new user
-- with no limits and an empty wallet cannot spend whether they are in paper
-- or live. Funding a wallet and setting limits are both deliberate acts, and
-- having done them, being told to flip a third switch is friction with no
-- safety behind it.
--
-- Paper stays one command away for practice: /paper.

alter table public.veyro_users alter column mode set default 'live';

-- Existing rows keep the mode they have, deliberately. Some of them are test
-- automation that runs buys on a schedule; flipping those to live would point
-- a robot at real funds. Anyone already on paper switches with /live when
-- they mean to.
