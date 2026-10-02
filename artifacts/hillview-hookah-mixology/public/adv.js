(() => {
  const BUTTON_ID = 'mixology-adv-button';
  const ANNOUNCEMENT = 'Mixology Pro, presented by Hillview Cafe. Play your music now using our app.';
  let speaking = false;

  const getPath = () => window.location.pathname.replace(/\\/+$/, '') || '/';

  function playStinger() {
    try {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (!AudioContextClass) return;
      const ctx = new AudioContextClass();
      const start = () => {
        const now = ctx.currentTime;
        const master = ctx.createGain();
        master.gain.setValueAtTime(0.0001, now);
        master.gain.exponentialRampToValueAtTime(0.18, now + 0.03);
        master.gain.exponentialRampToValueAtTime(0.0001, now + 0.65);
        master.connect(ctx.destination);

        [659.25, 783.99, 1046.5].forEach((frequency, index) => {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          const t = now + index * 0.09;
          osc.type = index === 2 ? 'sine' : 'triangle';
          osc.frequency.setValueAtTime(frequency, t);
          gain.gain.setValueAtTime(0.0001, t);
          gain.gain.exponentialRampToValueAtTime(0.7, t + 0.025);
          gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.35);
          osc.connect(gain);
          gain.connect(master);
          osc.start(t);
          osc.stop(t + 0.38);
        });

        window.setTimeout(() => {
          try { void ctx.close(); } catch {}
        }, 1000);
      };
      if (ctx.state === 'suspended') void ctx.resume().then(start).catch(() => {});
      else start();
    } catch {}
  }

  function chooseVoice() {
    const voices = window.speechSynthesis?.getVoices?.() || [];
    return voices.find(v => /^en-IN/i.test(v.lang)) ||
      voices.find(v => /^en-GB/i.test(v.lang)) ||
      voices.find(v => /^en-US/i.test(v.lang)) ||
      voices[0];
  }

  function playAnnouncement() {
    if (speaking) return;
    speaking = true;
    const button = document.getElementById(BUTTON_ID);
    if (button) {
      button.disabled = true;
      button.textContent = 'ADV • PLAYING';
    }

    // This intentionally uses a separate browser audio path. It does NOT
    // call pauseVideo(), loadVideoById(), or otherwise interrupt YouTube.
    playStinger();

    window.setTimeout(() => {
      try {
        window.speechSynthesis.cancel();
        const utterance = new SpeechSynthesisUtterance(ANNOUNCEMENT);
        const voice = chooseVoice();
        if (voice) utterance.voice = voice;
        utterance.lang = voice?.lang || 'en-IN';
        utterance.rate = 0.94;
        utterance.pitch = 0.95;
        utterance.volume = 1;
        utterance.onend = finish;
        utterance.onerror = finish;
        window.speechSynthesis.speak(utterance);
      } catch {
        finish();
      }
    }, 420);

    function finish() {
      speaking = false;
      const currentButton = document.getElementById(BUTTON_ID);
      if (currentButton) {
        currentButton.disabled = false;
        currentButton.textContent = 'ADV';
      }
    }
  }

  function addButton() {
    if (getPath() !== '/manage/dj') return;
    if (document.getElementById(BUTTON_ID)) return;

    const buttons = Array.from(document.querySelectorAll('button'));
    const nextButton = buttons.find(button => (button.textContent || '').trim() === 'Next');
    if (!nextButton?.parentElement) return;

    const button = document.createElement('button');
    button.id = BUTTON_ID;
    button.type = 'button';
    button.title = 'Play Mixology PRO announcement over the current music';
    button.setAttribute('aria-label', 'Play Mixology PRO advertisement announcement');
    button.className = 'flex min-h-12 flex-1 items-center justify-center gap-2 rounded-2xl border border-secondary/50 bg-secondary/10 px-5 text-sm font-bold text-secondary-foreground hover:bg-secondary/20 disabled:cursor-not-allowed disabled:opacity-50';
    button.textContent = 'ADV';
    button.addEventListener('click', playAnnouncement);

    nextButton.parentElement.appendChild(button);
  }

  const observer = new MutationObserver(addButton);
  observer.observe(document.documentElement, { childList: true, subtree: true });
  window.addEventListener('popstate', addButton);
  window.setTimeout(addButton, 500);
  window.setTimeout(addButton, 1500);

  // Prime the voice list on browsers that populate it asynchronously.
  if (window.speechSynthesis) window.speechSynthesis.getVoices();
})();
