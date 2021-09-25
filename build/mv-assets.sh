cp "/Users/connorclark/Documents/Paid Assets/Gravity Sound - RPG SFX Pack 2/Gravity Sound - Video Game SFX Pack #1 12 - CC BY 4.0/Dropping item 4.wav" worlds/rpgwo-world/sound/sfx/paid/move.wav
cp "/Users/connorclark/Documents/Paid Assets/Gravity Sound - RPG SFX Pack 2/Gravity Sound - Video Game SFX Pack #1 22 - CC BY 4.0/Reflect 2.wav" worlds/rpgwo-world/sound/sfx/paid/magic.wav

mkdir -p worlds/rpgwo-world/sound/music/aaron-anderson-11
cp "/Users/connorclark/Documents/Free Assets/aaron-anderson-11/301 - Good Memories.mp3" "worlds/rpgwo-world/sound/music/aaron-anderson-11/Good Memories.mp3"

find worlds/rpgwo-world/sound/music -iname '*.wav' -type f -exec bash -c 'NAME="{}" && ffmpeg -i "{}" -codec:a libmp3lame -qscale:a 2 "${NAME/.wav/.mp3}" -y' \; -exec /bin/rm {} \;
