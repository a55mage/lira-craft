import type { Track } from '../types/music';

const now = '2026-11-27T10:00:00.000Z';

export const DEMO_TRACKS: Track[] = [
  {
    id: 'demo-somebody-that-i-used-to-know',
    title: 'Somebody That I Used to Know',
    artist: 'Gotye (feat. Kimbra)',
    originalKey: 'Am',
    defaultBpm: 129,
    timeSignature: '4/4',
    tags: ['Pop', 'Piano', 'Accordi Pop 1', 'Principianti'],
    isFavorite: true,
    createdAt: '2026-11-27T13:07:00.000Z',
    updatedAt: '2026-11-27T13:07:00.000Z',
    versions: [
      {
        id: 'demo-somebody-pop-chords-1',
        name: 'Piano — Accordi Pop 1 (Solo Tasti Bianchi: Am · G · F)',
        instrument: 'piano',
        difficulty: 'beginner',
        capo: 0,
        bpmOverride: 112,
        notes: 'Arrangiamento stile Accordi Pop 1 (tutti tasti bianchi): strofa Am–G a blocchi regolari, ritornello Am–G–F–G. Rallenta all\'80% per prendere confidenza con i cambi!',
        lyricsChords: `{section: Intro (Pattern Pop 1)}
[Am]  [G]  [Am]  [G]

{section: Strofa 1}
[Am]Now and then I [G]think of when we [Am]were toge[G]ther
[Am]Like when you said you [G]felt so happy [Am]you could [G]die
[Am]Told myself that [G]you were right for [Am]me
[G]But felt so lonely [Am]in your compa[G]ny
[Am]But that was love and it's an [G]ache I still re[Am]member [G]

{section: Ritornello (Accordi Pop 1: Am - G - F - G)}
[Am]But you didn't [G]have to [F]cut me [G]off
[Am]Make out like it [G]never happened [F]and that we were [G]nothing
[Am]And I don't even [G]need your [F]love [G]
[Am]But you treat me like a [G]stranger and that [F]feels so [G]rough
[Am]No, you didn't [G]have to [F]stoop so [G]low
[Am]Have your friends col[G]lect your records [F]and then change your [G]number
[Am]I guess that I don't [G]need that [F]though [G]
[Am]Now you're just some[G]body that I [F]used to [G]know

{section: Outro}
[Am]Somebo[G]dy that I [F]used to [G]know
[Am]Somebo[G]dy (Now you're just some[F]body that I [G]used to [Am]know)`,
        abcNotation: `X:1
T:Somebody That I Used to Know (Accordi Pop 1 - Am)
M:4/4
L:1/4
Q:1/4=112
K:Am
"Am"A2 e2 | "G"d2 B2 | "Am"A2 e2 | "G"d2 B2 |
"Am"A c e c | "G"B G d B | "Am"A c e c | "G"B4 |
"Am"e2 c2 | "G"d2 B2 | "F"c2 A2 | "G"B2 G2 |
"Am"e e c c | "G"d d B B | "F"c c A A | "G"B4 |
"Am"e2 c2 | "G"d2 B2 | "F"c2 A2 | "G"B2 G2 |
"Am"A2 c2 | "G"B2 G2 | "F"A2 F2 | "G"G2 B2 | "Am"A4 |]`,
        updatedAt: '2026-11-27T13:07:00.000Z',
      },
      {
        id: 'demo-somebody-original-dm',
        name: 'Piano — Tonalità Originale (Dm · C · Bb)',
        instrument: 'piano',
        difficulty: 'intermediate',
        capo: 0,
        bpmOverride: 129,
        notes: 'Tonalità originale in Re minore (Dm). Attenzione al Sib (Bb) nel ritornello (tasto nero).',
        lyricsChords: `{section: Intro}
[Dm]  [C]  [Dm]  [C]

{section: Strofa 1}
[Dm]Now and then I [C]think of when we [Dm]were toge[C]ther
[Dm]Like when you said you [C]felt so happy [Dm]you could [C]die
[Dm]Told myself that [C]you were right for [Dm]me
[C]But felt so lonely [Dm]in your compa[C]ny
[Dm]But that was love and it's an [C]ache I still re[Dm]member [C]

{section: Ritornello}
[Dm]But you didn't [C]have to [Bb]cut me [C]off
[Dm]Make out like it [C]never happened [Bb]and that we were [C]nothing
[Dm]And I don't even [C]need your [Bb]love [C]
[Dm]But you treat me like a [C]stranger and that [Bb]feels so [C]rough
[Dm]No, you didn't [C]have to [Bb]stoop so [C]low
[Dm]Have your friends col[C]lect your records [Bb]and then change your [C]number
[Dm]I guess that I don't [C]need that [Bb]though [C]
[Dm]Now you're just some[C]body that I [Bb]used to [C]know [Dm]`,
        abcNotation: `X:1
T:Somebody That I Used to Know (Originale - Dm)
M:4/4
L:1/4
Q:1/4=129
K:Dm
"Dm"D2 A2 | "C"G2 E2 | "Dm"D2 A2 | "C"G2 E2 |
"Dm"D F A F | "C"E C G E | "Dm"D F A F | "C"E4 |
"Dm"A2 F2 | "C"G2 E2 | "Bb"F2 D2 | "C"E2 C2 |
"Dm"A A F F | "C"G G E E | "Bb"F F D D | "C"E4 |
"Dm"D2 F2 | "C"E2 C2 | "Bb"D2 _B,2 | "C"C2 E2 | "Dm"D4 |]`,
        updatedAt: '2026-11-27T13:07:00.000Z',
      },
    ],
  },
  {
    id: 'demo-ode-to-joy',
    title: 'Inno alla Gioia (Ode to Joy)',
    artist: 'Ludwig van Beethoven',
    originalKey: 'C',
    defaultBpm: 100,
    timeSignature: '4/4',
    tags: ['Classica', 'Principianti', 'Melodia'],
    isFavorite: true,
    createdAt: now,
    updatedAt: now,
    versions: [
      {
        id: 'demo-ode-piano-beg',
        name: 'Principiante (Mano Destra + Accordi)',
        instrument: 'piano',
        difficulty: 'beginner',
        capo: 0,
        notes: 'Usa solo le 5 dita della mano destra su Do-Re-Mi-Fa-Sol. Perfetto per iniziare!',
        lyricsChords: `{section: Tema A}
[C]Gioia, bella scin[G]tilla divina,
[C]figlia dell'[G]Eliso [C]sei!
[C]Noi entriamo [G]eb-bri di fuoco,
[C]nel tuo [G]tempio, o [C]Dea!

{section: Tema B}
[G]Il tuo incanto [C]riunisce
[G]ciò che il [C]mondo sepa[G]rò,
[C]tutti gli uomini [G]son fratelli
[C]dove [G]posa il [C]volo tuo.`,
        abcNotation: `X:1
T:Inno alla Gioia (Principiante)
M:4/4
L:1/4
Q:1/4=100
K:C
"C"E E F G | "G"G F E D | "C"C C D E | "G"E3/2 D/2 "C"D2 |
"C"E E F G | "G"G F E D | "C"C C D E | "G"D3/2 C/2 "C"C2 |
"G"D D E C | "G"D E/2F/2 E C | "G"D E/2F/2 E D | "C"C D "G"G,2 |
"C"E E F G | "G"G F E D | "C"C C D E | "G"D3/2 C/2 "C"C2 |]`,
        updatedAt: now,
      },
      {
        id: 'demo-ode-piano-int',
        name: 'Intermedio (Armonia Arricchita)',
        instrument: 'piano',
        difficulty: 'intermediate',
        capo: 0,
        notes: 'Aggiunge accordi di passaggio (Am, F, G7) per un suono più pieno.',
        lyricsChords: `{section: Tema A}
[C]Gioia, bella [G]scintilla divina,
[Am]figlia dell'[Em]Eliso [F]se[G]i!
[C]Noi entriamo [G]eb-bri di fuoco,
[Am]nel tuo [F]tempio, [G7]o [C]Dea!`,
        abcNotation: `X:1
T:Inno alla Gioia (Intermedio)
M:4/4
L:1/4
Q:1/4=108
K:C
"C"E E F G | "G"G F E D | "Am"C C "Em"D E | "F"E3/2 D/2 "G"D2 |
"C"E E F G | "G"G F E D | "Am"C C "F"D E | "G7"D3/2 C/2 "C"C2 |
"G"D D "C"E C | "G"D E/2F/2 "C"E C | "G"D E/2F/2 "Am"E D | "Dm"C D "G7"G2 |
"C"E E F G | "G"G F E D | "Am"C C "F"D E | "G7"D3/2 C/2 "C"C2 |]`,
        updatedAt: now,
      },
      {
        id: 'demo-ode-ukulele-beg',
        name: 'Ukulele Facile (3 Accordi)',
        instrument: 'ukulele',
        difficulty: 'beginner',
        capo: 0,
        notes: 'Pennata semplice giù-giù-giù-giù su ogni battuta. Solo C, G e F.',
        lyricsChords: `{section: Tema A}
[C]Gioia, bella scin[G]tilla divina,
[C]figlia dell'[G]Eliso [C]sei!
[C]Noi entriamo [G]eb-bri di fuoco,
[F]nel tuo [G]tempio, o [C]Dea!`,
        abcNotation: `X:1
T:Inno alla Gioia (Ukulele)
M:4/4
L:1/4
Q:1/4=96
K:C
"C"E E F G | "G"G F E D | "C"C C D E | "G"E3/2 D/2 "C"D2 |
"C"E E F G | "G"G F E D | "F"C C D E | "G"D3/2 C/2 "C"C2 |]`,
        updatedAt: now,
      },
    ],
  },
  {
    id: 'demo-la-canzone-del-sole',
    title: 'La Canzone del Sole (Studio Giro 3 Accordi)',
    artist: 'Standard Italiano (Giro A-E-D)',
    originalKey: 'A',
    defaultBpm: 112,
    timeSignature: '4/4',
    tags: ['Italiana', 'Falò', 'Chitarra', 'Ukulele'],
    isFavorite: true,
    createdAt: now,
    updatedAt: now,
    versions: [
      {
        id: 'demo-sole-guitar-beg',
        name: 'Chitarra Principiante (Giro A - E - D - E)',
        instrument: 'guitar',
        difficulty: 'beginner',
        capo: 0,
        notes: 'Il classico giro da falò! Ritmica consigliata: Giù - Giù - Su - Su - Giù - Su.',
        lyricsChords: `{section: Intro}
[A]  [E]  [D]  [E]

{section: Strofa}
[A]Le bionde trecce gli [E]occhi azzurri e poi
[D]le tue calzette [E]rosse
[A]e l'innocenza [E]sulle gote tue
[D]due arance ancor più [E]rosse

{section: Ritornello}
[A]O mare [E]nero, o mare [D]nero, o mare [E]ne...
[A]tu eri [E]chiaro e traspa[D]rente come [E]me!`,
        abcNotation: `X:1
T:Giro del Sole (A - E - D - E)
M:4/4
L:1/4
Q:1/4=112
K:A
"A"A2 c2 | "E"B2 G2 | "D"F2 A2 | "E"B4 |
"A"A c e c | "E"B G E G | "D"F A d A | "E"B4 |
"A"e2 c2 | "E"B2 G2 | "D"A2 F2 | "E"E4 |]`,
        updatedAt: now,
      },
      {
        id: 'demo-sole-uku-easy',
        name: 'Ukulele Semplificato (In Do: C - G - F - G)',
        instrument: 'ukulele',
        difficulty: 'beginner',
        capo: 0,
        notes: 'Trasposta in Do per evitare l\'accordo di Mi maggiore (E) sull\'ukulele!',
        lyricsChords: `{section: Intro}
[C]  [G]  [F]  [G]

{section: Strofa}
[C]Le bionde trecce gli [G]occhi azzurri e poi
[F]le tue calzette [G]rosse
[C]e l'innocenza [G]sulle gote tue
[F]due arance ancor più [G]rosse

{section: Ritornello}
[C]O mare [G]nero, o mare [F]nero, o mare [G]ne...
[C]tu eri [G]chiaro e traspa[F]rente come [G]me!`,
        abcNotation: `X:1
T:Giro del Sole (Ukulele in Do)
M:4/4
L:1/4
Q:1/4=112
K:C
"C"C2 E2 | "G"D2 B,2 | "F"A,2 C2 | "G"D4 |
"C"C E G E | "G"D B, G, B, | "F"A, C F C | "G"D4 |
"C"G2 E2 | "G"D2 B,2 | "F"C2 A,2 | "G"G,4 |]`,
        updatedAt: now,
      },
    ],
  },
  {
    id: 'demo-over-the-rainbow',
    title: 'Over the Rainbow (Ukulele Island Style)',
    artist: 'Israel Kamakawiwoʻole (Arrangiamento Studio)',
    originalKey: 'C',
    defaultBpm: 88,
    timeSignature: '4/4',
    tags: ['Ukulele', 'Pop', 'Rilassante'],
    isFavorite: false,
    createdAt: now,
    updatedAt: now,
    versions: [
      {
        id: 'demo-rainbow-uku-beg',
        name: 'Ukulele Principiante (Island Strum)',
        instrument: 'ukulele',
        difficulty: 'beginner',
        capo: 0,
        notes: 'Ritmica Island Strum: Giù - (pausa) - Giù - Su - (pausa) - Su - Giù - Su.',
        lyricsChords: `{section: Intro}
[C]  [Em]  [F]  [C]
[F]  [C]  [G]  [Am]  [F]

{section: Strofa}
[C]Somewhere [Em]over the rainbow, [F]way up [C]high
[F]And the [C]dreams that you dreamed of [G]once in a lulla[Am]by [F]
[C]Somewhere [Em]over the rainbow, [F]bluebirds [C]fly
[F]And the [C]dreams that you dreamed of, [G]dreams really do come [Am]true [F]`,
        abcNotation: `X:1
T:Over the Rainbow (Studio)
M:4/4
L:1/4
Q:1/4=88
K:C
"C"C2 c2 | "Em"B2 G A | "F"B c "C"C2 | "F"A2 "C"G2 |
"G"D2 E F | "Am"E C "F"A,2 | "C"C2 c2 | "Em"B2 G A |
"F"B c "C"G2 | "G"F E D C | "C"C4 |]`,
        updatedAt: now,
      },
      {
        id: 'demo-rainbow-piano-int',
        name: 'Piano Arpeggiato',
        instrument: 'piano',
        difficulty: 'intermediate',
        capo: 0,
        notes: 'Suona gli accordi arpeggiati con la mano sinistra mentre la destra porta la melodia.',
        lyricsChords: `{section: Strofa}
[C]Somewhere [Em]over the rainbow, [F]way up [C]high
[F]And the [C]dreams that you dreamed of [G]once in a lulla[Am]by [F]`,
        abcNotation: `X:1
T:Over the Rainbow (Piano)
M:4/4
L:1/4
Q:1/4=84
K:C
"C"C2 c2 | "Em"B3/2 G/2 A B | "F"c2 "C"E2 | "F"A2 "C"G2 |
"G"D3/2 E/2 F G | "Am"E C "F"A2 | "C"G4 |]`,
        updatedAt: now,
      },
    ],
  },
  {
    id: 'demo-greensleeves',
    title: 'Greensleeves',
    artist: 'Tradizionale',
    originalKey: 'Am',
    defaultBpm: 96,
    timeSignature: '3/4',
    tags: ['Tradizionale', 'Valzer', 'Fingerstyle'],
    isFavorite: false,
    createdAt: now,
    updatedAt: now,
    versions: [
      {
        id: 'demo-green-guitar-int',
        name: 'Chitarra (3/4 Arpeggio)',
        instrument: 'guitar',
        difficulty: 'intermediate',
        capo: 0,
        notes: 'Tempo in 3/4 (valzer). Conta 1-2-3 su ogni battuta.',
        lyricsChords: `{section: Strofa}
Alas my [Am]love, you [C]do me [G]wrong
To [Am]cast me off dis[E7]courteously
For [Am]I have [C]loved you [G]oh so long
De[Am]lighting in [E7]your [Am]company.

{section: Ritornello}
[C]Greensleeves was [G]all my joy
[Am]Greensleeves was [E7]my delight
[C]Greensleeves was my [G]heart of gold
And [Am]who but my [E7]lady [Am]Greensleeves.`,
        abcNotation: `X:1
T:Greensleeves
M:3/4
L:1/4
Q:1/4=96
K:Am
"Am"A | "Am"c2 d | "C"e3/2 f/2 e | "G"d2 B | "G"G3/2 A/2 B |
"Am"c2 A | "Am"A3/2 ^G/2 A | "E7"B2 ^G | "E7"E2 A |
"Am"c2 d | "C"e3/2 f/2 e | "G"d2 B | "G"G3/2 A/2 B |
"Am"c3/2 B/2 A | "E7"^G3/2 ^F/2 ^G | "Am"A3 | "Am"A2 z |]`,
        updatedAt: now,
      },
    ],
  },
];
