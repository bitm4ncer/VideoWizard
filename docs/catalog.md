# VideoWizard Katalog

Erzeugt von `npm run catalog` aus den Skills unter `skills/` und den
Bausteinen in `blocks/index.json`. Diese Datei wird nicht von Hand gepflegt.

## Skills

### meta

- **harvesting-learnings**: Use when a measured observation should become an entry in learnings/, when an existing entry needs its target and consequence decided, or when an incorporated entry must be marked.
- **using-videowizard**: Use when starting VideoWizard work, when a video task arrives, or when it is unclear which planning or production skill applies.

### planning

- **planning-short**: Use when planning a short video for Reels, Shorts or TikTok, or when a short needs a hook and a retention structure.
- **reference-analysis**: Use when a loved reference video should become a reliable creative brief, or when a reference video needs measuring before planning.
- **storyboarding**: Use when an approved beat structure should become a shot list, or when a video plan needs its visual theme and gates recorded.

### producing

- **handoff-to-diffusion**: Use when a finished cut should be polished by a human in Diffusion Studio, or when a hand-off folder, its one-way rule and its limits must be understood.
- **making-a-short**: Use when a planned short has to be produced, or when it is unclear which capability supplies transcript, voice, music, editing or captions.

### tools

- **tool-ace-step**: Use when local music generation is needed, when ACE-Step does not respond, or when its setup, API or limits are unclear.
- **tool-elevenlabs**: Use when ElevenLabs supplies voice or music, when its key is missing, or when its endpoints and limits are unclear.
- **tool-ffmpeg**: Use when ffmpeg must be checked, installed or used for a VideoWizard job, or when a loudness value needs its source.
- **tool-voicebox**: Use when local speech from a cloned voice is needed, when Voicebox does not respond, or when its setup, API or limits are unclear.
- **tool-whisper**: Use when a source needs a local transcript, when whisper-ctranslate2 is missing, or when its recipe, word times or limits are unclear.

### reference

- **blocks**: Use when a ready-made artifact is needed, when blocks/index.json or its fields must be read, or when block integrity must be checked.
- **video-anatomy**: Use when beat structure, format sizes or loudness targets for a video are needed, before planning or producing it.

## Bausteine

- **beats-short-retention**: Retention-Struktur fuer Shorts: Hook, Confirm, Payoff, Loop oder CTA (Lizenz: MIT)
- **ffmpeg-captions**: Wortzeiten als ASS-Untertitel brennen, Stilwerte aus der Safe-Zone (Lizenz: MIT)
- **ffmpeg-loudnorm**: Loudness nach EBU R128: Stimme auf -16, Endmischung auf -14 LUFS (Lizenz: MIT)
- **scaffold-client-asset**: Geruest fuer Kundenarbeit: plan.md mit Treatment, Visuellem Thema, Shotliste, Freigaben und Entscheidungen, dazu eine project.json-Vorlage (Lizenz: MIT)
- **style-bold-short**: Laute Style-Karte: harte Schnitte, fette Typografie, kraeftiges Grading fuer Shorts (Lizenz: MIT)
- **style-clean-tutorial**: Ruhige Style-Karte: helle Palette, klare Typografie, sanfte Motion fuer Tutorials (Lizenz: MIT)
