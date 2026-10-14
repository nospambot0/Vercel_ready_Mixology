(() => {
  const BUTTON_ID = 'mixology-adv-button';
  const ANNOUNCEMENT = 'Mixology Pro, presented by Hillview Cafe. Play your music now using our app.';
  let speaking = false;
  let currentAudio = null;
  let currentObjectUrl = null;

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
          osc.connect(gain); gain.connect(master); osc.start(t); osc.stop(t + 0.38);
        });
        window.setTimeout(() => { try { void ctx.close(); } catch {} }, 1000);
      };
      if (ctx.state === 'suspended') void ctx.resume().then(start).catch(() => {});
      else start();
    } catch {}
  }

  function chooseVoice() {
    const voices = window.speechSynthesis?.getVoices?.() || [];
    return voices.find(v => /^en-IN/i.test(v.lang)) ||
      voices.find(v => /^en-GB/i.test(v.lang)) ||
      voices.find(v => /^en-US/i.test(v.lang)) || voices[0];
  }

  async function playAnnouncement() {
    if (speaking) return;
    speaking = true;
    const button = document.getElementById(BUTTON_ID);
    if (button) { button.disabled = true; button.textContent = 'ADV • LOADING'; }
    playStinger();

    try {
      const response = await fetch('/api/dj/voice', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ text: ANNOUNCEMENT })
      });
      if (!response.ok) {
        let detail = 'Request failed with HTTP ' + response.status;
        try {
          const payload = await response.json();
          if (payload && typeof payload.error === 'string') detail = payload.error;
        } catch {}
        throw new Error(detail);
      }
      const contentType = response.headers.get('content-type') || '';
      if (!contentType.toLowerCase().includes('audio/')) {
        const detail = await response.text().catch(() => '');
        throw new Error(detail.slice(0, 180) || 'The server did not return audio.');
      }
      const audioBlob = await response.blob();
      if (!audioBlob.size) throw new Error('ElevenLabs returned an empty audio file.');
      currentObjectUrl = URL.createObjectURL(audioBlob);
      currentAudio = new Audio(currentObjectUrl);
      currentAudio.preload = 'auto';
      currentAudio.onended = finish;
      currentAudio.onerror = () => reportVoiceError('The generated audio could not be played in this browser.');
      if (button) button.textContent = 'ADV • PLAYING';
      await currentAudio.play();
    } catch (error) {
      reportVoiceError(error instanceof Error ? error.message : 'Unknown error');
    }
  }

  function finish() {
    speaking = false;
    if (currentAudio) {
      currentAudio.onended = null;
      currentAudio.onerror = null;
      currentAudio = null;
    }
    if (currentObjectUrl) {
      URL.revokeObjectURL(currentObjectUrl);
      currentObjectUrl = null;
    }
    const button = document.getElementById(BUTTON_ID);
    if (button) { button.disabled = false; button.textContent = 'ADV'; }
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
    button.title = 'Play a premium AI DJ announcement over the current music';
    button.setAttribute('aria-label', 'Play Mixology PRO AI DJ announcement');
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
  if (window.speechSynthesis) window.speechSynthesis.getVoices();
})();
