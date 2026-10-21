// Voice in the sky: whoever is near is heard, whoever is far is not. Full
// voice inside `full` metres, fading out to nothing at `range` — so a pilot
// closing in comes up out of the quiet, and one pulling away fades into it.
// (The fade over time, so a jump in distance is not a jump in volume, is
// the screen's: the gain glides to where this says it should be.)

export const VOICE = {
  /** Heard at full strength up to here (m). */
  full: 250,
  /** Heard not at all past here (m). */
  range: 500,
  /** How long a change in volume takes to settle (s): the fade in and out. */
  glide: 0.35,
};

/** How loud a voice is at distance d: 1 near, easing down to 0 at the range. */
export function voiceGain(d) {
  if (!(d >= 0)) return 0;
  if (d <= VOICE.full) return 1;
  if (d >= VOICE.range) return 0;
  const t = (d - VOICE.full) / (VOICE.range - VOICE.full);
  // smooth at both ends: no corner where it starts to fade or where it ends
  return 1 - t * t * (3 - 2 * t);
}
