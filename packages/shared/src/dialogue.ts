// 2D game: conversations with the villagers. The player picks what to say, the villager answers.
// Every villager has their own stories and questions; jokes, riddles, the weather and "how are you"
// are shared. Nodes are addressed by id; options point at the next node ('' ends the talk).
import type { Season, WeatherKind } from './types.ts';

export interface TalkCtx {
  /** The player's name. */
  name: string;
  weather: WeatherKind | null;
  /** Fraction of the game day 0..1. */
  dayFraction: number;
  season: Season;
  /** Names of the player's pets and horses (with species), e.g. "Bamse (Hund)". */
  pets: { name: string; species: string }[];
  rnd: () => number;
}

export interface TalkOption {
  text: string;
  /** Next node id; '' closes the conversation. */
  go: string;
}

export interface Talk {
  say: string;
  options: TalkOption[];
}

type Opt = [text: string, go: string];
interface Node {
  say: string | string[];
  opts?: Opt[];
}

interface NpcTalk {
  hello: string[];
  bye: string[];
  how: string[];
  likes: string[];
  /** Their own topics: label in the topic list and the node it starts at. */
  topics: Opt[];
  nodes: Record<string, Node>;
  /** A question the villager asks you, with a reply to each answer. */
  ask: { q: string; answers: Opt[] };
  /** Their own take on some kinds of weather (the rest use the shared lines). */
  weather?: Partial<Record<WeatherKind, string>>;
  /** What they say when you tell them about your pet ({pet} is its name). */
  pet?: string[];
}

const BACK: Opt = ['Prata om något annat', 'topics'];

// ---------------------------------------------------------------------------
// Shared talk
// ---------------------------------------------------------------------------

export const JOKES: { q: string; a: string }[] = [
  { q: 'Vad är grönt och åker upp och ner?', a: 'En gurka i en hiss! 🥒' },
  { q: 'Vilket djur kan hoppa högre än ett hus?', a: 'Alla djur – hus kan ju inte hoppa! 🏠' },
  { q: 'Vad sa den ena snögubben till den andra?', a: '"Känner du också lukten av morötter?" ⛄' },
  { q: 'Varför har giraffen så lång hals?', a: 'För att fötterna luktar så illa! 🦒' },
  { q: 'Vad får man om man korsar en ko med en studsmatta?', a: 'Milkshake! 🐄' },
  { q: 'Två kor står på en äng. Den ena säger "Muuu!". Vad säger den andra?', a: '"Det var precis vad jag tänkte säga!" 🐮' },
  { q: 'Vad sa nollan till åttan?', a: '"Vilket snyggt bälte du har!" 0️⃣8️⃣' },
  { q: 'Vilket ord är längst i hela världen?', a: 'Smila – det är ju en mil mellan s och a! 😄' },
  { q: 'Varför gick hönan över vägen?', a: 'För att komma till andra sidan! 🐔' },
  { q: 'Vad är gult och kan inte simma?', a: 'En grävmaskin! Den har ju bara en arm. 🚜' },
  { q: 'Varför målar elefanterna tånaglarna röda?', a: 'För att kunna gömma sig i jordgubbslandet! Har du sett någon elefant där? Nej? Där ser du – det funkar! 🐘' },
  { q: 'Vad är skillnaden på en fågel?', a: 'Båda benen är lika långa – särskilt det vänstra! 🐦' },
];

export const RIDDLES: { q: string; answers: string[]; right: number }[] = [
  { q: 'Vad har fyra ben men kan inte gå?', answers: ['En katt', 'Ett bord', 'En fisk'], right: 1 },
  { q: 'Vad blir blötare ju mer det torkar?', answers: ['En handduk', 'Solen', 'En sko'], right: 0 },
  { q: 'Vad har ett öga men kan inte se?', answers: ['En uggla', 'En pirat', 'En nål'], right: 2 },
  { q: 'Vad har många tänder men kan inte bita?', answers: ['En kam', 'En haj', 'En hund'], right: 0 },
  { q: 'Ju mer du tar bort från mig, desto större blir jag. Vad är jag?', answers: ['En tårta', 'Ett hål', 'En sten'], right: 1 },
  { q: 'Vad kan man fånga men aldrig kasta?', answers: ['En boll', 'En fisk', 'En förkylning'], right: 2 },
  { q: 'Vilken månad har 28 dagar?', answers: ['Februari', 'Alla månader', 'Juni'], right: 1 },
  { q: 'Vad har en hals men inget huvud?', answers: ['En flaska', 'En giraff', 'En orm'], right: 0 },
  { q: 'Vad har tangenter men kan inte låsa upp en enda dörr?', answers: ['En vaktmästare', 'En bil', 'Ett piano'], right: 2 },
  { q: 'Vad springer men går aldrig, och har en bädd men sover aldrig?', answers: ['En å', 'En hund', 'En klocka'], right: 0 },
  { q: 'Vad går upp men kommer aldrig ner igen?', answers: ['En ballong', 'Hur gammal man är', 'En hiss'], right: 1 },
  { q: 'Vad är ditt, men används mest av alla andra?', answers: ['Din tandborste', 'Ditt namn', 'Din cykel'], right: 1 },
];

const RIGHT = ['Rätt! Du är smart som en räv! 🦊', 'Helt rätt! Vilken klurig hjärna du har! 🧠', 'Ja! Precis så! ⭐'];
const WRONG = ['Nästan! Vill du gissa en gång till?', 'Hmm, nej… Försök igen!', 'Inte riktigt. En gissning till?'];

const WEATHER_TALK: Record<WeatherKind, string[]> = {
  sun: ['Vilket härligt solsken! Perfekt dag att vara ute.', 'Solen värmer så skönt idag. ☀️'],
  cloudy: ['Lite grått idag, men molnen ser ut som djur om man tittar noga. Jag ser en kanin!', 'Molnigt, men det kanske klarnar upp.'],
  rain: ['Plask plask! Regnet vattnar alla blommor och grödor. Glöm inte att hoppa i vattenpölar!', 'Det regnar! Bra för åkrarna, men ta på dig stövlarna.'],
  storm: ['Oj, vad det mullrar! Åskan låter farlig men den är långt borta. Räkna sekunderna mellan blixten och mullret!', 'Åskväder! Det är mysigt att höra regnet när man sitter inne.'],
  snow: ['Det snöar! Ska vi bygga en snögubbe? ⛄', 'Titta på snöflingorna – inga två är likadana!'],
  hail: ['Hagel! Små isbollar från himlen. Hu, det smattrar på taket!', 'Hagel är som regn som har frusit på vägen ner.'],
  wind: ['Vad det blåser! Håll i hatten! 🎩', 'Blåsigt! Perfekt väder för att flyga drake.'],
  fog: ['Så dimmigt! Det känns som att gå i ett moln.', 'I dimman ser allt lite hemligt och spännande ut.'],
};

const HOW_REPLY: Record<string, string[]> = {
  good: ['Vad roligt att höra! Då blir jag också glad. 😊', 'Härligt! Glada människor gör hela dagen finare.'],
  tired: ['Trött? Kanske dags för en liten vila. Sängen i huset är skön!', 'Alla blir trötta ibland. Ett glas mjölk och en vila brukar hjälpa.'],
  sad: ['Åh, vad tråkigt. Vill du ha en kram? 🤗 Det brukar hjälpa att klappa ett djur eller prata med någon man tycker om.', 'Det är okej att vara ledsen ibland. Jag är här om du vill prata.'],
  angry: ['Arg? Andas djupt tre gånger – in genom näsan, ut genom munnen. Bättre?', 'Ibland blir man arg, det är helt okej. Ett springlopp runt gården kanske hjälper!'],
};

const PET_TALK = ['{pet}! Vilket fint namn. Hälsa från mig!', 'Åh, {pet}! Jag har sett hen springa omkring. Så söt!', 'Klappa {pet} lite extra från mig idag. ❤️'];

const TOPIC_HINTS = ['Vad vill du prata om?', 'Något mer du undrar?', 'Vad ska vi prata om nu?'];

// ---------------------------------------------------------------------------
// The villagers
// ---------------------------------------------------------------------------

export const NPC_TALK: Record<string, NpcTalk> = {
  greta: {
    hello: ['Nej men hej {name}! Kom och sätt dig en stund.', 'Hej lilla vän! Vad roligt att du vill prata med en gammal tant.'],
    bye: ['Hej då, {name}! Kom snart tillbaka.', 'Ta hand om dig nu, lilla vän!'],
    how: ['Jag mår prima! Lite ont i knät, men det gör inget när solen skiner.', 'Bara bra, tack! Jag har stickat en halv vante idag.'],
    likes: ['Jag tycker om att baka bullar, sticka vantar och sitta i solen med min katt Misse.'],
    topics: [
      ['Hur var det på gården förr?', 'greta:old'],
      ['Har du någon katt?', 'greta:cat'],
      ['Vad bakar du helst?', 'greta:bake'],
    ],
    nodes: {
      'greta:old': {
        say: 'När jag var liten som du fanns det ingen el här! Vi hämtade vatten i brunnen och lyste med fotogenlampor.',
        opts: [
          ['Fanns det tv?', 'greta:tv'],
          ['Vad lekte du med?', 'greta:play'],
          BACK,
        ],
      },
      'greta:tv': { say: 'Tv? Nej då! Vi lyssnade på radio och berättade sagor för varandra. Det var minst lika roligt.', opts: [['Vad lekte du med?', 'greta:play'], BACK] },
      'greta:play': { say: 'Vi lekte kurragömma i ladan och byggde kojor i skogen. En gång gömde jag mig så bra att ingen hittade mig förrän till middagen!', opts: [['Haha! Var gömde du dig?', 'greta:hide'], BACK] },
      'greta:hide': { say: 'I höet! Jag somnade där. När jag vaknade satt en liten mus på min näsa. 🐭', opts: [BACK] },
      'greta:cat': { say: 'Ja, Misse! Hon är randig och tjock och sover helst på min stickning. Hon är tretton år gammal.', opts: [['Fångar hon möss?', 'greta:mouse'], BACK] },
      'greta:mouse': { say: 'Misse? Nej då. Hon och musen i skafferiet är nog bästa vänner. De delar på ostbitarna, tror jag.', opts: [BACK] },
      'greta:bake': { say: 'Kanelbullar, förstås! Mjöl, smör, socker och mycket kanel. Har du mjölk och vete får du gärna hjälpa mig.', opts: [['Kan jag laga mat själv?', 'greta:cook'], BACK] },
      'greta:cook': { say: 'Absolut! Det står en spis inne i huset. Där kan du laga pannkakor och mycket mer.', opts: [BACK] },
    },
    ask: {
      q: 'Får jag fråga dig en sak? Vilken kaka tycker du bäst om?',
      answers: [
        ['Kanelbulle', 'Mmm, min favorit också! Vi är likadana, du och jag.'],
        ['Chokladboll', 'Chokladbollar rullar man själv, det är det roliga. Glöm inte kokosen!'],
        ['Pannkaka', 'Pannkakor med sylt! Det åt jag varje torsdag när jag var liten.'],
        ['Jordgubbstårta', 'Med grädde och jordgubbar från landet. Det smakar sommar!'],
      ],
    },
    weather: { rain: 'Regn igen! Mina rosor blir glada, men mitt hår blir alldeles krulligt.', snow: 'Snö! Då stickar jag nya vantar åt alla barnen i byn.' },
  },
  sven: {
    hello: ['Tjenare {name}! Har du kommit för att höra en fiskehistoria?', 'Hallå där! Tyst nu, så skrämmer vi inte fiskarna.'],
    bye: ['Ha det gött, {name}! Napp och dapp!', 'Hej då! Vinka åt fiskarna åt mig.'],
    how: ['Jag mår bra som en fisk i vattnet! Haha, förstår du skämtet?', 'Lite blöt om fötterna, men annars toppen.'],
    likes: ['Fiska, förstås! Och att sitta i båten och titta på trollsländor.'],
    topics: [
      ['Berätta om guldfisken!', 'sven:gold'],
      ['Vilken är den största fisk du fångat?', 'sven:big'],
      ['Hur fiskar man?', 'sven:how'],
    ],
    nodes: {
      'sven:gold': {
        say: 'Det sägs att det simmar en guldfisk i dammen. Den som fångar den får tur i en hel vecka!',
        opts: [
          ['Har du sett den?', 'sven:seen'],
          ['Kan jag fånga den?', 'sven:catch'],
          BACK,
        ],
      },
      'sven:seen': { say: 'En gång! Den glittrade som en stjärna under vattnet och blinkade åt mig. Sen var den borta.', opts: [['Kan jag fånga den?', 'sven:catch'], BACK] },
      'sven:catch': { say: 'Kanske! Kasta med fiskespöet, vänta tills det blir ett utropstecken och dra då. Guldfisken nappar bara ibland, så ha tålamod.', opts: [BACK] },
      'sven:big': { say: 'En gädda, SÅ HÄR STOR! (Sven sträcker ut armarna så långt han kan.) Okej… kanske lite mindre.', opts: [['Hur mycket mindre?', 'sven:smaller'], BACK] },
      'sven:smaller': { say: 'Ungefär som en banan. Men den var väldigt arg! Jag släppte tillbaka den.', opts: [BACK] },
      'sven:how': { say: 'Håll fiskespöet och använd det mot vattnet. När det blir ett ❗ över dig nappar det – använd spöet igen, snabbt!', opts: [['Vilka fiskar finns det?', 'sven:fish'], BACK] },
      'sven:fish': { say: 'Mört, abborre, gädda och den sällsynta guldfisken. Mörten är vanligast, gäddan är luringast.', opts: [BACK] },
    },
    ask: {
      q: 'Säg, om du fick en egen båt – vad skulle du döpa den till?',
      answers: [
        ['Plurret', 'Plurret! Haha, hoppas den inte gör plurr på riktigt.'],
        ['Snabba Sara', 'Snabba Sara! Den skulle vinna alla kappseglingar.'],
        ['Glada Gäddan', 'Glada Gäddan! Fiskarna skulle simma fram och hälsa.'],
        ['{name}s båt', 'Kort och bra! Då vet alla vems båt det är.'],
      ],
    },
    weather: { rain: 'Regn är bäst för fiske! Fiskarna kommer upp och tittar på dropparna.', storm: 'Åska! Då ror jag in till land. Säkerheten först, även för fiskare.' },
  },
  elsa: {
    hello: ['Hej {name}! Ska vi leka? Snälla snälla!', 'Hej hej {name}! Jag har väntat på dig hela dagen!'],
    bye: ['Hejdå! Vi leker igen sen, va?', 'Hej då {name}! Glöm inte att vi är kompisar!'],
    how: ['Jättebra! Jag har hittat en nyckelpiga med sju prickar!', 'Bra! Fast jag tappade en tand idag. Titta! (Elsa visar en glugg.)'],
    likes: ['Springa, leka kurragömma och plocka blommor! Och min kanin Snövit.'],
    topics: [
      ['Ska vi spela sten, sax, påse?', 'rps'],
      ['Ska vi leka kurragömma?', 'elsa:hide'],
      ['Berätta om Snövit!', 'elsa:bunny'],
      ['Har du en hemlighet?', 'elsa:secret'],
    ],
    nodes: {
      'elsa:hide': { say: 'Jaa! Jag räknar till tio och du gömmer dig. Ett… två… tre… tio! Där är du! Du gömde dig inte ens, haha!', opts: [['Igen! Nu gömmer jag mig på riktigt', 'elsa:hide2'], BACK] },
      'elsa:hide2': { say: 'Okej! Ett… två… … tio! Hmm… var kan du vara? Bakom trädet? I dammen? Jag ger upp! Du vann! 🎉', opts: [BACK] },
      'elsa:bunny': { say: 'Snövit är vit som snö och har rosa nos. Hon äter morötter och skuttar runt i köket när mamma inte ser.', opts: [['Får jag träffa henne?', 'elsa:meet'], BACK] },
      'elsa:meet': { say: 'Hon är blyg… Men om du ger mig en morot kan jag ge den till henne från dig!', opts: [BACK] },
      'elsa:secret': { say: 'Lova att inte säga något… Jag tror att det bor ett troll i grottan! Ett snällt troll. Kanske.', opts: [['Jag lovar! 🤐', 'elsa:troll'], ['Jag har varit där!', 'elsa:been'], BACK] },
      'elsa:troll': { say: 'Bra! Om du träffar trollet, säg att Elsa hälsar. Och att det får komma på mitt kalas.', opts: [BACK] },
      'elsa:been': { say: 'VA?! Var du inte rädd? Du är modigast i hela världen!', opts: [BACK] },
    },
    ask: {
      q: 'Vad är ditt favoritdjur? Mitt är kanin!',
      answers: [
        ['Hund', 'Hundar är så mysiga! De viftar på svansen när de blir glada.'],
        ['Katt', 'Katter spinner! Det låter som en liten motor. Brrrr!'],
        ['Häst', 'Hästar är så stora och fina! Jag ska rida när jag blir stor.'],
        ['Kanin', 'Samma som jag! Vi är kaninkompisar! 🐰'],
        ['Enhörning', 'Enhörningar! Jag tror de bor bortom bergen. Vi får leta tillsammans!'],
      ],
    },
    weather: { rain: 'Regn! Då hoppar jag i alla vattenpölar. PLASK!', snow: 'SNÖ! Jag ska göra en snöängel!', storm: 'Åskan låter som ett jättestort troll som har ont i magen.' },
    pet: ['Får jag klappa {pet}? Snälla! ❤️', '{pet}! Jag ska leka med {pet} sen!'],
  },
  bo: {
    hello: ['Välkommen, {name}! Doftar det inte gott här?', 'Hej {name}! Jag har mjöl på näsan igen, va?'],
    bye: ['Hej då! Kom tillbaka när bullarna är klara.', 'Ha det bra, {name}! Ät ordentligt nu.'],
    how: ['Varm och glad! Ugnen har varit på sen klockan fyra i morse.', 'Mjölig men lycklig, som alltid.'],
    likes: ['Doften av nybakat bröd på morgonen. Och att se folk le när de tar en tugga.'],
    topics: [
      ['Hur bakar man bröd?', 'bo:bread'],
      ['Varför stiger du upp så tidigt?', 'bo:early'],
    ],
    nodes: {
      'bo:bread': { say: 'Mjöl, vatten, jäst och lite salt. Knåda, knåda, knåda! Sen får degen vila och växa under en handduk.', opts: [['Varför växer degen?', 'bo:yeast'], BACK] },
      'bo:yeast': { say: 'Jästen är pyttesmå levande svampar som äter socker och pruttar luftbubblor. Det är därför brödet blir fluffigt!', opts: [['Pruttar?! 😂', 'bo:fart'], BACK] },
      'bo:fart': { say: 'Japp! Varje bröd du har ätit är fullt av jästprutt. Haha, säg inte det till Pino.', opts: [BACK] },
      'bo:early': { say: 'Folk vill ha färska frallor till frukost! Så jag stiger upp när tuppen fortfarande sover.', opts: [['Blir du inte trött?', 'bo:tired'], BACK] },
      'bo:tired': { say: 'Jo, därför tar jag en tupplur efter lunch. En bagare utan tupplur blir en sur bagare.', opts: [BACK] },
    },
    ask: {
      q: 'Vad vill du helst ha på din smörgås?',
      answers: [
        ['Ost', 'Ost är klassiskt! En ostsmörgås löser nästan alla problem.'],
        ['Gurka', 'Krisp krisp! Gurka gör smörgåsen fräsch.'],
        ['Sylt', 'Sylt på smörgås? Modigt! Jag gillar det.'],
        ['Allt på en gång!', 'En jättemacka! Du får nog öppna munnen väldigt stort.'],
      ],
    },
    weather: { snow: 'Snö! Då vill alla ha varm choklad och bullar. Bra för affärerna!', rain: 'Regniga dagar luktar det extra gott från bageriet, tycker jag.' },
  },
  pino: {
    hello: ['Ciao {name}! Välkommen till min pizzeria!', 'Buongiorno! Mamma mia, vad roligt att se dig!'],
    bye: ['Ciao ciao! Arrivederci, {name}!', 'Buonanotte! Eller… hej då, på svenska!'],
    how: ['Benissimo! Det betyder jättebra på italienska.', 'Som en pizza med extra ost – perfetto!'],
    likes: ['Pizza, fotboll och att sjunga när jag lagar mat. Lalalaaa! 🎶'],
    topics: [
      ['Lär mig italienska!', 'pino:words'],
      ['Var kommer du ifrån?', 'pino:home'],
      ['Hur gör man en pizza?', 'pino:pizza'],
    ],
    nodes: {
      'pino:words': { say: 'Ciao betyder hej. Grazie betyder tack. Delizioso betyder jättegott! Vill du ha ett förhör?', opts: [['Ja, förhör mig!', 'pino:quiz'], BACK] },
      'pino:quiz': { say: 'Vad betyder grazie?', opts: [['Hej', 'pino:quizno'], ['Tack', 'pino:quizyes'], ['Pizza', 'pino:quizno']] },
      'pino:quizyes': { say: 'Bravo! Perfetto! Du pratar ju italienska nu! 🇮🇹', opts: [BACK] },
      'pino:quizno': { say: 'Nej nej! Grazie betyder tack. Grazie för att du försökte!', opts: [['Fråga igen!', 'pino:quiz'], BACK] },
      'pino:home': { say: 'Från Neapel i Italien! Där uppfanns pizzan. Det är varmt och det finns en stor vulkan som heter Vesuvius.', opts: [['En vulkan?!', 'pino:volcano'], BACK] },
      'pino:volcano': { say: 'Sì! Den sover nu. Min farmor sa att den snarkar ibland. Hehe.', opts: [BACK] },
      'pino:pizza': { say: 'Vete blir deg, tomater blir sås, och sen ost på toppen! In i stenugnen – och vips, pizza! Ta med tomater och vete så bakar jag åt dig.', opts: [BACK] },
    },
    ask: {
      q: 'Vad vill du ha på din pizza, {name}?',
      answers: [
        ['Ost och skinka', 'En Capricciosa-ish! Klassiskt och gott.'],
        ['Ananas', 'Ananas?! Mamma mia… Okej, för dig gör jag ett undantag. 🍍'],
        ['Bara ost', 'En margherita! Den enklaste och kanske den godaste.'],
        ['Glass', 'GLASS på pizza?! Haha! Det får bli efterrätt i stället. 🍦'],
      ],
    },
    weather: { rain: 'Regn? I Neapel regnar det nästan aldrig. Men här får man äta pizza inne och mysa!', sun: 'Sol! Nästan som hemma i Italien. Bellissimo!' },
  },
  stina: {
    hello: ['Hej {name}! Akta, det är varmt här vid ässjan.', 'Tjena! Vill du se hur man smider?'],
    bye: ['Hej då! Kom tillbaka när du hittat fina stenar.', 'Ha det bra, {name}! Klang klang!'],
    how: ['Starkare än en björn idag! Jag har smitt tolv hästskor.', 'Lite sotig, men på strålande humör.'],
    likes: ['Att smida, klättra i berg och leta ädelstenar. Ju mer det glittrar desto bättre!'],
    topics: [
      ['Finns det drakar i bergen?', 'stina:dragon'],
      ['Hur gör man en hästsko?', 'stina:shoe'],
    ],
    nodes: {
      'stina:dragon': { say: 'Det sägs att en drake sover djupt inne i berget och vaktar ädelstenar. Jag har hört den snarka!', opts: [['Är den farlig?', 'stina:danger'], ['Jag tror inte på drakar', 'stina:nodragon'], BACK] },
      'stina:danger': { say: 'Nej då, den vill bara sova. Men väck den inte – den blir sur om morgnarna, precis som jag.', opts: [BACK] },
      'stina:nodragon': { say: 'Nähä? Vem har då ätit upp alla mina korvar som jag lämnade vid grottan? Hmm…', opts: [BACK] },
      'stina:shoe': { say: 'Man hettar järnet tills det glöder orange, sen bankar man det runt städet. Klang, klang, klang! Sen doppar man i vatten – PSSSS!', opts: [['Gör det ont för hästen?', 'stina:hurt'], BACK] },
      'stina:hurt': { say: 'Inte alls! Hovarna är som naglar. Det känns ungefär som när du klipper naglarna.', opts: [BACK] },
    },
    ask: {
      q: 'Om du var smed, vad skulle du smida?',
      answers: [
        ['Ett svärd', 'Ett svärd för en riktig hjälte! Du får det första jag gör.'],
        ['En krona', 'En krona med ädelstenar! Kung eller drottning {name}!'],
        ['En hästsko', 'Smart! Hästskor ger tur, säger man.'],
        ['En robot', 'En ROBOT? Ingen har bett om det förut. Jag älskar det! 🤖'],
      ],
    },
    weather: { hail: 'Hagel! Det låter som tusen små hammare på taket. Nästan som min smedja!', wind: 'Blåst! Bra för ässjan, elden flammar upp.' },
  },
  lind: {
    hello: ['God dag, {name}! Har du kommit för att titta på mina blommor?', 'Hej {name}! Hör du bina? De sjunger idag.'],
    bye: ['Hej då, {name}! Lukta på en blomma på vägen hem.', 'Adjö! Ta med dig solsken.'],
    how: ['Jag mår fint, tack! Mina tulpaner har just slagit ut.', 'Lugn och glad, som en humla i en solros.'],
    likes: ['Blommor, bin, honung och att sitta i trädgården med en kopp te.'],
    topics: [
      ['Varför surrar bina?', 'lind:bees'],
      ['Hur får man blommor att växa?', 'lind:grow'],
    ],
    nodes: {
      'lind:bees': { say: 'Det är vingarna! De slår över tvåhundra gånger varje sekund. Bzzzz!', opts: [['Hur gör de honung?', 'lind:honey'], BACK] },
      'lind:honey': { say: 'De suger upp nektar från blommorna och tar hem den till kupan. Där blir den till honung. Ett bi gör bara en liten tesked under hela sitt liv!', opts: [['Bara en tesked?!', 'lind:spoon'], BACK] },
      'lind:spoon': { say: 'Ja, så nästa gång du äter honung – tacka bina! 🐝', opts: [BACK] },
      'lind:grow': { say: 'Sol, vatten och lite kärlek. Jag pratar med mina blommor varje morgon. De växer bättre då, tror jag.', opts: [['Vad säger du till dem?', 'lind:say'], BACK] },
      'lind:say': { say: '"God morgon, mina sötnosar! Vad fina ni är idag!" Prova själv på dina grödor!', opts: [BACK] },
    },
    ask: {
      q: 'Vilken färg tycker du är finast på en blomma?',
      answers: [
        ['Röd', 'Röda rosor! Som ett litet hjärta i trädgården. ❤️'],
        ['Gul', 'Gul som solrosor och smörblommor! Glada blommor.'],
        ['Lila', 'Lila som lavendel. Den luktar så gott!'],
        ['Regnbågsfärgad', 'Alla färger på en gång! Då får vi plantera en regnbåge. 🌈'],
      ],
    },
    weather: { rain: 'Äntligen regn! Mina blommor dricker och dricker.', wind: 'Blåsten sprider blomfrön långt bort. Snart växer det blommor överallt!' },
    pet: ['Säg till {pet} att inte gräva i mina rabatter, är du snäll. 😉', '{pet}! Vilket fint namn, nästan som en blomma.'],
  },
};

// ---------------------------------------------------------------------------
// Engine
// ---------------------------------------------------------------------------

const pick = <T>(list: T[], rnd: () => number): T => list[Math.floor(rnd() * list.length) % list.length]!;
const fill = (s: string, ctx: TalkCtx, extra: Record<string, string> = {}): string =>
  s.replace(/\{(\w+)\}/g, (m, k: string) => (k === 'name' ? ctx.name : (extra[k] ?? m)));

/** The topics you can bring up with a villager. */
function topics(def: NpcTalk, ctx: TalkCtx): TalkOption[] {
  const list: Opt[] = [...def.topics, ['Hur mår du?', 'how']];
  if (ctx.weather) list.push(['Vad tycker du om vädret?', 'weather']);
  list.push(['Berätta ett skämt!', 'joke'], ['Har du en gåta?', 'riddle'], ['Vad tycker du om?', 'likes']);
  if (ctx.pets.length) list.push(['Jag har ett husdjur!', 'pet']);
  list.push(['Fråga mig något!', 'ask'], ['Hej då!', 'bye']);
  return list.map(([text, go]) => ({ text: fill(text, ctx), go }));
}

function greeting(def: NpcTalk, ctx: TalkCtx): string {
  const f = ctx.dayFraction;
  const time = f < 0.25 ? 'God morgon! ' : f > 0.8 ? 'Oj, är du uppe så här sent? ' : '';
  const season = ctx.season === 'jul' ? ' God jul förresten! 🎄' : ctx.season === 'halloween' ? ' Glad Halloween! 🎃' : ctx.season === 'pask' ? ' Glad påsk! 🐣' : ctx.season === 'midsommar' ? ' Glad midsommar! 🌸' : '';
  return time + fill(pick(def.hello, ctx.rnd), ctx) + season;
}

/**
 * What a villager says at a node and what you can answer. Random choices (which joke, which riddle,
 * Elsa's hand in sten, sax, påse) are made here, so call it once per step and keep the result.
 */
export function talkNode(npcId: string, node: string, ctx: TalkCtx): Talk {
  const def = NPC_TALK[npcId];
  if (!def) return { say: '…', options: [{ text: 'Hej då!', go: '' }] };
  const back = { text: BACK[0], go: BACK[1] };
  const say = (s: string, options: TalkOption[] = [back], extra?: Record<string, string>): Talk => ({ say: fill(s, ctx, extra), options });
  const parts = node.split(':');
  switch (parts[0]) {
    case 'start':
      return { say: greeting(def, ctx), options: topics(def, ctx) };
    case 'topics':
      return { say: pick(TOPIC_HINTS, ctx.rnd), options: topics(def, ctx) };
    case 'bye':
      return say(pick(def.bye, ctx.rnd), [{ text: 'Hej då! 👋', go: '' }]);
    case 'how':
      if (parts[1]) return say(pick(HOW_REPLY[parts[1]] ?? HOW_REPLY.good!, ctx.rnd));
      return say(`${pick(def.how, ctx.rnd)} Och du då, {name}? Hur mår du?`, [
        { text: 'Jättebra! 😄', go: 'how:good' },
        { text: 'Lite trött 😴', go: 'how:tired' },
        { text: 'Lite ledsen 😢', go: 'how:sad' },
        { text: 'Arg! 😠', go: 'how:angry' },
      ]);
    case 'weather': {
      const w = ctx.weather ?? 'sun';
      return say(def.weather?.[w] ?? pick(WEATHER_TALK[w], ctx.rnd));
    }
    case 'likes':
      return say(pick(def.likes, ctx.rnd), [{ text: 'Vad gillar du inte då?', go: 'dislikes' }, back]);
    case 'dislikes':
      return say(pick(['Spindlar i badkaret! Usch. 🕷️', 'När strumporna blir blöta. Det är det värsta jag vet.', 'Att gå och lägga mig när det är roligt. Precis som du, kanske?'], ctx.rnd));
    case 'pet': {
      if (parts[1] === 'nice') return say('Det märks! Djur som blir klappade blir alltid snälla. ❤️');
      if (!ctx.pets.length) return say('Ett husdjur? Det vore mysigt! I brevlådan kan man köpa hund eller katt.');
      const pet = pick(ctx.pets, ctx.rnd);
      return say(pick(def.pet ?? PET_TALK, ctx.rnd), [{ text: `${pet.name} är jättesnäll!`, go: 'pet:nice' }, back], { pet: pet.name });
    }
    case 'joke': {
      if (parts[1] === undefined) {
        const i = Math.floor(ctx.rnd() * JOKES.length) % JOKES.length;
        return say(`Okej, här kommer ett: ${JOKES[i]!.q}`, [
          { text: 'Vet inte, vad då?', go: `joke:${i}` },
          { text: 'Jag vet!', go: `joke:${i}` },
        ]);
      }
      const j = JOKES[Number(parts[1])] ?? JOKES[0]!;
      return say(`${j.a} Hahaha!`, [{ text: 'Haha! Ett till! 😂', go: 'joke' }, back]);
    }
    case 'riddle': {
      const i = parts[1] === undefined ? Math.floor(ctx.rnd() * RIDDLES.length) % RIDDLES.length : Number(parts[1]);
      const r = RIDDLES[i] ?? RIDDLES[0]!;
      const answers = r.answers.map((text, a) => ({ text, go: `riddle:${i}:${a}` }));
      if (parts[2] === undefined) return say(`Här är en gåta: ${r.q}`, answers);
      if (parts[2] === 'give') return say(`Svaret är: ${r.answers[r.right]}! Klurig, va?`, [{ text: 'En till!', go: 'riddle' }, back]);
      if (Number(parts[2]) === r.right) return say(`${pick(RIGHT, ctx.rnd)} Svaret är ${r.answers[r.right]!.toLowerCase()}.`, [{ text: 'En till!', go: 'riddle' }, back]);
      return say(`${pick(WRONG, ctx.rnd)} ${r.q}`, [...answers, { text: 'Jag ger upp', go: `riddle:${i}:give` }]);
    }
    case 'rps': {
      const hands = ['Sten ✊', 'Sax ✌️', 'Påse ✋'];
      if (parts[1] === undefined) return say('Sten, sax, påse… nu!', hands.map((text, h) => ({ text, go: `rps:${h}` })));
      const you = Number(parts[1]) % 3;
      const me = Math.floor(ctx.rnd() * 3) % 3;
      const mine = hands[me]!.split(' ')[0]!.toLowerCase();
      const result = you === me ? 'Lika! Vi tänker likadant!' : (you + 1) % 3 === me ? 'Du vann! Grattis! 🎉' : 'Jag vann! Jippi! 🎉';
      return say(`Jag tog ${mine}! ${result}`, [{ text: 'Igen!', go: 'rps' }, { text: 'Nu räcker det', go: 'topics' }]);
    }
    case 'ask': {
      if (parts[1] === undefined) return say(def.ask.q, def.ask.answers.map(([text], a) => ({ text: fill(text, ctx), go: `ask:${a}` })));
      const a = def.ask.answers[Number(parts[1])];
      return say(a ? a[1] : 'Vad spännande!');
    }
  }
  const n = def.nodes[node];
  if (!n) return { say: pick(TOPIC_HINTS, ctx.rnd), options: topics(def, ctx) };
  return say(Array.isArray(n.say) ? pick(n.say, ctx.rnd) : n.say, (n.opts ?? [BACK]).map(([text, go]) => ({ text: fill(text, ctx), go })));
}
