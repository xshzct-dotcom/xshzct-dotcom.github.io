// ===== 声音效果 — 柔和相册翻页声 =====
(function(){
  var ctx = null;
  var enabled = true;

  function ensureCtx(){
    if(!ctx){
      try { ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch(e){ enabled = false; }
    }
    return ctx;
  }

  function envelope(gain, attack, decay, peak){
    var t = ctx.currentTime;
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(peak, t + attack);
    gain.gain.exponentialRampToValueAtTime(0.001, t + attack + decay);
  }

  // 翻页声 — 柔和纸张摩擦（低频+轻微白噪）
  function playFlip(){
    if(!enabled) return;
    var c = ensureCtx(); if(!c) return;
    // 纸张摩擦 — 低频闷声
    var osc = c.createOscillator();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(120, c.currentTime);
    osc.frequency.exponentialRampToValueAtTime(40, c.currentTime + 0.12);
    var g = c.createGain();
    envelope(g, 0.01, 0.15, 0.08);
    osc.connect(g).connect(c.destination);
    osc.start();
    osc.stop(c.currentTime + 0.18);
    // 极轻的高频"沙沙"声
    var buffer = c.createBuffer(1, c.sampleRate * 0.1, c.sampleRate);
    var data = buffer.getChannelData(0);
    for(var i=0;i<data.length;i++) data[i] = Math.random() * 0.3 * (1 - i/data.length);
    var src = c.createBufferSource();
    src.buffer = buffer;
    var filter = c.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 600;
    filter.Q.value = 2;
    var g2 = c.createGain();
    envelope(g2, 0.008, 0.08, 0.04);
    src.connect(filter).connect(g2).connect(c.destination);
    src.start();
  }

  // 快门 — 柔和"咔"
  function playShutter(){
    if(!enabled) return;
    var c = ensureCtx(); if(!c) return;
    var osc = c.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(300, c.currentTime);
    osc.frequency.exponentialRampToValueAtTime(100, c.currentTime + 0.04);
    var g = c.createGain();
    envelope(g, 0.002, 0.05, 0.06);
    osc.connect(g).connect(c.destination);
    osc.start();
    osc.stop(c.currentTime + 0.06);
    // 微弱的第二声（反光镜回弹）
    setTimeout(function(){
      var osc2 = c.createOscillator();
      osc2.type = 'sine';
      osc2.frequency.setValueAtTime(200, c.currentTime);
      osc2.frequency.exponentialRampToValueAtTime(80, c.currentTime + 0.03);
      var g3 = c.createGain();
      envelope(g3, 0.002, 0.03, 0.03);
      osc2.connect(g3).connect(c.destination);
      osc2.start();
      osc2.stop(c.currentTime + 0.04);
    }, 40);
  }

  // 轻敲 — 极柔点击
  function playClick(){
    if(!enabled) return;
    var c = ensureCtx(); if(!c) return;
    var osc = c.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(400, c.currentTime);
    osc.frequency.exponentialRampToValueAtTime(150, c.currentTime + 0.03);
    var g = c.createGain();
    envelope(g, 0.002, 0.03, 0.03);
    osc.connect(g).connect(c.destination);
    osc.start();
    osc.stop(c.currentTime + 0.04);
  }

  // 柔和叮
  function playTick(){
    if(!enabled) return;
    var c = ensureCtx(); if(!c) return;
    var osc = c.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = 1200;
    var g = c.createGain();
    envelope(g, 0.002, 0.05, 0.04);
    osc.connect(g).connect(c.destination);
    osc.start();
    osc.stop(c.currentTime + 0.06);
  }

  window.SFX = {
    flip: playFlip,
    shutter: playShutter,
    click: playClick,
    tick: playTick,
    toggle: function(){ enabled = !enabled; },
    enabled: function(){ return enabled; },
  };
})();
