// Oribu — ALL feel numbers live here. Units: tiles (32 px) and seconds. Sim runs at a fixed 60 steps/s.
export const TILE = 32;
export const HZ = 60;
export const T = {
  // run
  runTop: 6,            // tiles/s
  runAccelTime: 0.15,   // s from 0 to top
  runDecelTime: 0.08,   // s from top to 0 (stops within ~0.25 tile)
  airDecelTime: 0.35,   // s, when no input in the air (keeps wall-kicks and swing launches flowing)
  overspeedDrag: 6,     // tiles/s² bleed when faster than runTop (after a swing launch)
  // jump
  jumpHold: 4.5,        // tiles, holding jump
  jumpTap: 2,           // tiles, a quick tap
  gravity: 75,          // tiles/s² base
  fallMult: 1.6,        // gravity multiplier while falling
  maxFall: 28,          // tiles/s
  coyote: 0.15,         // s grace after leaving a ledge
  buffer: 0.12,         // s a jump press is remembered before landing
  // swing
  swingRange: 6,        // tiles: grabs nearest glowing anchor ahead/above
  ropeMax: 5,           // tiles: rope length at grab is capped here
  releaseBoost: 1.3,
  assistTime: 0.3,      // s after a swing release: horizontal steer toward the landing roof (gravity stays normal)
  assistMinRun: 10,
  assistLift: 10,        // tiles/s: a release always leaves with at least this much upward speed      // tiles/s forward speed floor during the assist
  swingMaxSpeed: 12,    // tiles/s
  swingPump: 10,        // tiles/s² sideways push from ◀ ▶ while swinging
  regrabDelay: 0.15,    // s after a release before the rope can grab again
  // wall
  wallSlideMax: 2,      // tiles/s
  wallJumpOut: 3,       // tiles
  wallJumpUp: 3.5,      // tiles
  wallLock: 0.15,       // s steering back toward the wall is ignored after a kick
  // bop + bounce
  bop: 3, bopHeld: 4.5, // tiles
  awning: 12,           // tiles, bounce awning height
  // pigeon side bump (no respawn)
  hitHopX: 4, hitHopUp: 1, // tiles/s back, tiles high
  invuln: 0.5,          // s grace after a bump: pigeons can't re-touch you (Oribu stays visible)
  // respawn
  respawnTime: 0.6,     // s total: spin + shrink, poof, then back at the flag
  poofAt: 0.15,         // s left on the respawn timer when the poof fires
  pigeonSpeed: 1.2,     // tiles/s
  pigeonRespawn: 3,     // s
  // body (px)
  w: 22, h: 68,         // solid box (tiles, walls, ceilings), feet-anchored; art is drawn at heroScale 1.3
  hurtW: 18, hurtH: 44, // pigeon touch box, centred on the body
};
// Derived values in px and px/s (computed, don't edit)
export function derive(t = T) {
  const g = t.gravity * TILE;
  const v = h => Math.sqrt(2 * g * h * TILE) + g / (2 * HZ); // + half-step so discrete 60 Hz integration reaches the full height
  const top = t.runTop * TILE;
  return {
    g, fallG: g * t.fallMult, maxFall: t.maxFall * TILE, top,
    accel: top / t.runAccelTime, decel: top / t.runDecelTime, airDecel: top / t.airDecelTime, overDrag: t.overspeedDrag * TILE,
    jumpV: v(t.jumpHold), cutMult: t.jumpHold / t.jumpTap, // releasing early multiplies rising gravity so a tap tops out at jumpTap
    range: t.swingRange * TILE, ropeMax: t.ropeMax * TILE, swingMax: t.swingMaxSpeed * TILE, pump: t.swingPump * TILE,
    wallSlide: t.wallSlideMax * TILE, wallUp: v(t.wallJumpUp),
    // horizontal speed so the kick covers wallJumpOut tiles by the apex
    wallOut: t.wallJumpOut * TILE / (v(t.wallJumpUp) / g),
    bopV: v(t.bop), hitUp: v(t.hitHopUp), hitX: t.hitHopX * TILE, assistMin: t.assistMinRun * TILE, assistLift: t.assistLift * TILE, bopHeldV: v(t.bopHeld), awningV: v(t.awning),
    pigeon: t.pigeonSpeed * TILE,
  };
}
