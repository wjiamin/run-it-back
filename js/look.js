/* The look of the site: "classic", or "fan", the new look being tried out alongside it (fan.css).

   Both looks are the same page and the same app: fan.css only restyles it, so every feature works in both. The choice
   is kept on this device, and a link can choose it too: add ?look=fan (or ?look=classic) to any page address.

   This is a plain script loaded in each page's <head>, before the page is drawn, so the page never flashes in the
   other look. It sets <html data-look="…"> and adds fan.css when needed.

   Usage (from the app): window.runItBackLook.get() → 'classic' | 'fan'; window.runItBackLook.set('fan'). */
(function(){
  var KEY = 'runItBack.look', LOOKS = ['classic', 'fan'];
  // fan.css sits next to styles.css, one folder up from this script
  var css = new URL('../fan.css', document.currentScript.src).href;

  function read(){
    try {
      var asked = new URLSearchParams(location.search).get('look');
      if (LOOKS.indexOf(asked) >= 0){ localStorage.setItem(KEY, asked); return asked; }
      var kept = localStorage.getItem(KEY);
      return LOOKS.indexOf(kept) >= 0 ? kept : 'classic';
    } catch (e){ return 'classic'; }   // storage blocked: the classic look
  }

  function apply(look){
    document.documentElement.dataset.look = look;
    var link = document.getElementById('lookCss');
    if (look === 'fan' && !link){
      link = document.createElement('link');
      link.id = 'lookCss'; link.rel = 'stylesheet'; link.href = css;
      document.head.appendChild(link);
    }
    if (link) link.disabled = look !== 'fan';
  }

  var current = read();
  apply(current);
  window.runItBackLook = {
    get: function(){ return current; },
    set: function(look){
      if (LOOKS.indexOf(look) < 0) return;
      current = look;
      try { localStorage.setItem(KEY, look); } catch (e){}
      apply(look);
    },
  };
})();
