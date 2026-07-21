// ===== 声音效果 =====
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

  // 翻页声 — 高频纸声 + 短促低频
  function playFlip(){
    if(!enabled) return;
    var c = ensureCtx(); if(!c) return;
    // 高频白噪声
    var buffer = c.createBuffer(1, c.sampleRate * 0.15, c.sampleRate);
    var data = buffer.getChannelData(0);
    for(var i=0;i<data.length;i++) data[i] = (Math.random()*2-1) * (1 - i/data.length);
    var src = c.createBufferSource();
    src.buffer = buffer;
    var filter = c.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.value = 2000;
    var gain = c.createGain();
    envelope(gain, 0.005, 0.12, 0.3);
    src.connect(filter).connect(gain).connect(c.destination);
    src.start();
    // 低频"砰"（纸接触桌面）
    setTimeout(function(){
      var osc = c.createOscillator();
      var g = c.createGain();
      osc.frequency.setValueAtTime(80, c.currentTime);
      osc.frequency.exponentialRampToValueAtTime(50, c.currentTime + 0.05);
      envelope(g, 0.003, 0.05, 0.15);
      osc.connect(g).connect(c.destination);
      osc.start();
      osc.stop(c.currentTime + 0.06);
    }, 60);
  }

  // 相机快门 — 短促"咔嚓"
  function playShutter(){
    if(!enabled) return;
    var c = ensureCtx(); if(!c) return;
    var buffer = c.createBuffer(1, c.sampleRate * 0.06, c.sampleRate);
    var data = buffer.getChannelData(0);
    for(var i=0;i<data.length;i++){
      data[i] = (Math.random()*2-1) * Math.exp(-i / (c.sampleRate * 0.015));
    }
    var src = c.createBufferSource();
    src.buffer = buffer;
    var filter = c.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 4000;
    filter.Q.value = 5;
    var gain = c.createGain();
    gain.gain.value = 0.4;
    src.connect(filter).connect(gain).connect(c.destination);
    src.start();
  }

  // 轻敲 — 中频短促
  function playClick(){
    if(!enabled) return;
    var c = ensureCtx(); if(!c) return;
    var osc = c.createOscillator();
    var g = c.createGain();
    osc.frequency.value = 800;
    osc.type = 'sine';
    envelope(g, 0.002, 0.04, 0.12);
    osc.connect(g).connect(c.destination);
    osc.start();
    osc.stop(c.currentTime + 0.05);
  }

  // 灯泡——柔和点击
  function playTick(){
    if(!enabled) return;
    var c = ensureCtx(); if(!c) return;
    var osc = c.createOscillator();
    var g = c.createGain();
    osc.frequency.value = 1800;
    osc.type = 'triangle';
    envelope(g, 0.001, 0.03, 0.06);
    osc.connect(g).connect(c.destination);
    osc.start();
    osc.stop(c.currentTime + 0.035);
  }

  // 拍立得拍摄——多次快门
  function playCapture(){
    playShutter();
    setTimeout(playShutter, 80);
  }

  window.SFX = {
    flip: playFlip,
    shutter: playShutter,
    click: playClick,
    tick: playTick,
    capture: playCapture,
    toggle: function(){ enabled = !enabled; },
    enabled: function(){ return enabled; },
  };
})();
