/* A practice session: plays a plan (plan.js) step by step.
   Each step is played `reps` times. Every run starts with a count-in and is followed by a pause.

   The session doesn't know about YouTube or the page. The app passes it an `env` with what it needs:
     settings                      the saved settings (leadStart, leadRepeat, rest, auto)
     period()                      seconds per beat
     seek(t), play(), pause()      the player
     onStep(step)                  a step (a part at one speed) is starting: set the speed and sound, remember progress
     onFinish()                    the plan is finished
     onChange()                    anything shown changed: redraw
     log(kind, message)
     now(), setTimer(fn, ms), clearTimer(id)   clocks, swappable in tests
   The app's tick() calls segmentEnd() when the playhead reaches the end of the part (step.e). */

import {planCountIn, stepLabel} from './plan.js';

/** After a seek the player's clock takes a moment to settle, so the app doesn't check the playhead for this long. */
const SETTLE_MS = 700;

export class Practice {
  constructor(plan, mode, startIndex, env){
    this.plan = plan;
    this.mode = mode;             // 'all' (the whole plan) or 'full' (only the whole-section runs)
    this.env = env;
    this.index = startIndex;      // the step being played
    this.rep = 0;                 // which run of this step, from 0
    this.from = 0;                // where this run starts, count-in included
    this.preRoll = false;         // the count-in plays the end of the part first (see planCountIn)
    this.countIn = 0;             // counts of count-in
    this.waiting = false;         // a part finished and "move on automatically" is off: waiting for you
    this.pausing = false;         // in the pause between runs
    this.done = false;            // the plan is finished
    this.ignoreUntil = 0;         // env.now() before which the app shouldn't check the playhead
    this.lastRun = null;          // {index, rep} of the last finished run, for Again
    this.timer = 0;               // the pause timer
    this.stopped = false;
  }

  get step(){ return this.plan[this.index]; }
  /** Playing a run (or about to): not paused between runs, not waiting, not finished. */
  get running(){ return !this.done && !this.waiting && !this.pausing; }
  /** The step being played, or the one just finished while waiting for you. */
  get current(){ return this.done ? null : this.plan[this.waiting ? this.index - 1 : this.index]; }

  start(){ this.startStep(0); }

  /** Stop for good (the session is being replaced or ended). */
  stop(){ this.stopped = true; this.env.clearTimer(this.timer); }

  /** Start the current step, after `delay` ms of pause. */
  startStep(delay){
    const st = this.step;
    this.env.log('practice', 'step ' + (this.index + 1) + '/' + this.plan.length + ': ' + stepLabel(st) + ' at ' + st.rate + 'x, ' +
      st.reps + (st.kind === 'block' ? ' reps' : ' runs'));
    this.env.onStep(st);
    this.startRun(delay);
  }

  /** Start one run of the current step, after `delay` ms of pause. */
  startRun(delay){
    const e = this.env;
    e.clearTimer(this.timer);
    Object.assign(this, planCountIn(this.step, this.rep === 0 ? e.settings.leadStart : e.settings.leadRepeat, e.period()));
    if (this.preRoll && this.rep === 0) e.log('practice', 'count-in loops round: ' + this.countIn + ' counts from the end of the part');
    this.ignoreUntil = e.now() + SETTLE_MS + delay;
    const go = () => {
      if (this.stopped) return;
      this.pausing = false;
      this.ignoreUntil = e.now() + SETTLE_MS;
      e.seek(this.from); e.play(); e.onChange();
    };
    if (delay > 0){ this.pausing = true; e.pause(); this.timer = e.setTimer(go, delay); e.onChange(); }
    else go();
  }

  /** The playhead reached the end of the part: after a pre-roll count-in jump to the part's start, otherwise the run is done. */
  segmentEnd(){
    if (!this.preRoll) return this.advance();
    this.preRoll = false;
    this.ignoreUntil = this.env.now() + SETTLE_MS;
    this.env.seek(this.step.s); this.env.play(); this.env.onChange();
  }

  /** A run finished: run it again, go to the next step (pausing first), wait for you, or finish. */
  advance(){
    const e = this.env, st = this.step, pauseMs = e.settings.rest * 1000;
    this.lastRun = {index: this.index, rep: this.rep};
    this.ignoreUntil = e.now() + SETTLE_MS + pauseMs;
    this.rep++;
    if (this.rep < st.reps) return this.startRun(pauseMs);
    const next = this.plan[this.index + 1];
    if (!next) return this.finish();
    this.index++; this.rep = 0;
    if (next.part !== st.part && !e.settings.auto){
      this.waiting = true;
      e.log('practice', 'waiting for you before ' + stepLabel(next));
      e.pause(); e.onChange();
      return;
    }
    this.startStep(pauseMs);
  }

  finish(){
    this.done = true;
    this.env.log('practice', 'complete');
    this.env.pause(); this.env.onFinish(); this.env.onChange();
  }

  /** Carry on now: skip the pause, or start the next part when waiting for you. */
  continueNow(){
    if (this.waiting){ this.waiting = false; return this.startStep(0); }
    if (this.pausing){ this.env.clearTimer(this.timer); this.pausing = false; this.startRun(0); }
  }

  /**
   * Again: redo the run that is playing, or the one that just finished (during the pause, while waiting, or after the end).
   * The redo doesn't count as a rep.
   */
  again(){
    const e = this.env;
    if (this.running){ e.log('practice', 'again: ' + stepLabel(this.step) + ', run ' + (this.rep + 1)); return this.startRun(0); }
    if (!this.lastRun) return;
    e.clearTimer(this.timer);
    const sameStep = !this.done && !this.waiting && this.lastRun.index === this.index;
    this.index = this.lastRun.index; this.rep = this.lastRun.rep;
    this.done = false; this.waiting = false; this.pausing = false;
    e.log('practice', 'again: ' + stepLabel(this.step) + ', run ' + (this.rep + 1));
    if (sameStep) this.startRun(0); else this.startStep(0);   // a different step needs its own speed and sound
  }

  /**
   * Where skip() goes, so the button can say so: {from, to} steps, with `to` null when it would finish the plan.
   * Null when there is nothing to skip.
   */
  get skipTarget(){
    if (this.done) return null;
    if (this.waiting || (this.pausing && this.rep === 0)) return {from: this.plan[this.index - 1] || null, to: this.step};
    return {from: this.step, to: this.plan[this.index + 1] || null};
  }

  /**
   * Skip ahead: skip the rest of this step (the remaining runs at this speed) and go on to the next step now.
   * In the pause before a new step, or while waiting, it just starts that step.
   */
  skip(){
    const e = this.env;
    if (this.done) return;
    if (this.waiting || (this.pausing && this.rep === 0)) return this.continueNow();
    e.clearTimer(this.timer);
    this.lastRun = {index: this.index, rep: this.rep};
    this.pausing = false; this.rep = 0;
    e.log('practice', 'skip: ' + stepLabel(this.step) + ' at ' + this.step.rate + 'x');
    if (!this.plan[this.index + 1]) return this.finish();
    this.index++;
    this.startStep(0);
  }
}
