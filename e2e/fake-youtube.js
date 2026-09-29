/* A pretend YouTube player, served in place of YouTube's iframe API in the browser tests (see fixtures.js).
   It behaves like the real one where the app depends on it:
     - time runs at the playback rate while playing, and the clock only updates a few times a second
     - it stops at the end of the video (ENDED)
     - commands take effect a moment later (window.__ytDelay ms, 150 by default)
     - once ENDED, seekTo is ignored and playVideo restarts from 0:00 (what a real player did in a debug report)
     - loadVideoById({startSeconds}) always plays from there, at 1× (the app sets the speed again)
   Tests can read window.__yt.events: [time, state, position] for state changes, and ['seek' | 'load', seconds]. */
(function(){
  const S = {ENDED: 0, PLAYING: 1, PAUSED: 2, BUFFERING: 3, CUED: 5};
  window.__yt = {events: [], player: null};
  class Player {
    constructor(el, opts){
      this.o = opts; this.t = 0; this.rate = 1; this.state = S.CUED; this.dur = window.__ytDuration || 29.7;
      window.__yt.player = this;
      setTimeout(() => { opts.events.onReady({target: this}); this.emit(S.CUED); }, 50);
      setInterval(() => {
        if (this.state !== S.PLAYING) return;
        this.t += 0.05 * this.rate;
        if (this.t >= this.dur){ this.t = this.dur; this.set(S.ENDED); }
      }, 50);
    }
    later(fn){ setTimeout(fn, window.__ytDelay || 150); }
    emit(s){ window.__yt.events.push([Math.round(performance.now()), s, +this.t.toFixed(2)]); this.o.events.onStateChange({data: s, target: this}); }
    set(s){ if (s !== this.state){ this.state = s; this.emit(s); } }
    getCurrentTime(){ return Math.floor(this.t * 4) / 4; }
    getDuration(){ return this.dur; }
    getVideoData(){ return {title: 'Test video'}; }
    getPlayerState(){ return this.state; }
    setPlaybackRate(r){ this.rate = r; }
    seekTo(t){ this.later(() => { window.__yt.events.push(['seek', t]); if (this.state === S.ENDED) return; this.t = t; if (this.state !== S.PAUSED) this.set(S.PLAYING); }); }
    loadVideoById(o){ this.later(() => { window.__yt.events.push(['load', o.startSeconds]); this.t = o.startSeconds; this.rate = 1; this.state = -1; this.set(S.PLAYING); }); }
    playVideo(){ this.later(() => { if (this.state === S.ENDED) this.t = 0; this.set(S.PLAYING); }); }
    pauseVideo(){ this.later(() => { if (this.state === S.PLAYING || this.state === S.CUED) this.set(S.PAUSED); }); }
    cueVideoById(){} mute(){} unMute(){} unloadModule(){}
  }
  window.YT = {Player, PlayerState: S};
  setTimeout(() => window.onYouTubeIframeAPIReady && window.onYouTubeIframeAPIReady(), 0);
})();
