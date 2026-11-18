# Licenses — Offbook / 脱稿

This app ships original practice scenes and pre-rendered audio. The software
libraries and voice models below are used as described.

## Piper (TTS engine)

Piper is licensed under the MIT License.
https://github.com/rhasspy/piper

The engine is used only on the build machine to render our original sentences.
The phonemizer is not bundled in the client app.

## Voices

Each Piper voice has its own dataset license. We do not use Lessac-derived or
libritts_r voices.

- **en_US-kristin-medium** (Maya) — trained from scratch on public-domain LibriVox material. See the official model card: https://huggingface.co/rhasspy/piper-voices
- **en_US-joe-medium** (Chris) — CC0. Official model card on the Piper voices repository.
- **en_US-ljspeech-high** (Jordan / narration) — trained from scratch on the public-domain LJ Speech dataset (https://keithito.com/LJ-Speech-Dataset/). Official model card on the Piper voices repository.

Rendered audio in this app is of our own original lines.

## Source Serif 4

Copyright 2014–2023 Adobe, with Reserved Font Name “Source”.
Licensed under the SIL Open Font License, Version 1.1.
https://scripts.sil.org/OFL

The full license text is also at `/fonts/OFL.txt`.
