# VideoWizard Katalog

Erzeugt von `npm run catalog` aus den Skills unter `skills/` und den
Bausteinen in `blocks/index.json`. Diese Datei wird nicht von Hand gepflegt.

## Skills

### meta

- **using-videowizard**: Use when starting VideoWizard work, when a video task arrives, or when it is unclear which planning or production skill applies.

### planning

- **planning-short**: Use when planning a short video for Reels, Shorts or TikTok, or when a short needs a hook and a retention structure.

### producing

- **making-a-short**: Use when a planned short has to be produced, or when it is unclear which capability supplies transcript, voice, music, editing or captions.

### tools

- **tool-ace-step**: Use when local music generation is needed, when ACE-Step does not respond, or when its setup, API or limits are unclear.
- **tool-ffmpeg**: Use when ffmpeg must be checked, installed or used for a VideoWizard job, or when a loudness value needs its source.
- **tool-voicebox**: Use when local speech from a cloned voice is needed, when Voicebox does not respond, or when its setup, API or limits are unclear.

### reference

- **blocks**: Use when a ready-made artifact is needed, when blocks/index.json or its fields must be read, or when block integrity must be checked.
- **video-anatomy**: Use when beat structure, format sizes or loudness targets for a video are needed, before planning or producing it.

## Bausteine

- **beats-short-retention**: Retention-Struktur fuer Shorts: Hook, Confirm, Payoff, Loop oder CTA (Lizenz: MIT)
- **ffmpeg-loudnorm**: Loudness nach EBU R128: Stimme auf -16, Endmischung auf -14 LUFS (Lizenz: MIT)
