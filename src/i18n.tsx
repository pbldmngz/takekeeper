import type { ComponentChildren } from 'preact';

// UI copy in English and Spanish. Keys are the English strings themselves, so the code
// reads as English and TypeScript rejects a key that is not in the Spanish dictionary.
// {name} interpolates, [[x]] renders a key cap, **x** bold (via `rich` / <T>).

export type Lang = 'en' | 'es';
export type LangSetting = 'auto' | Lang;

const es = {
  // landing / hero
  settings: 'ajustes',
  keys: 'teclas',
  'for voice actors': 'para actores de doblaje y locutores',
  'split a recording session into takes. keep the good ones.': 'divide una sesión de grabación en tomas. quédate con las buenas.',
  'drop the one long wav from your session. takekeeper cuts it at every silence, transcribes each take on your own gpu and matches it to your script, then you keep the good ones line by line with a single key and export the keepers as numbered files for fl studio, reaper or any daw.':
    'suelta el wav largo de tu sesión. takekeeper lo corta en cada silencio, transcribe cada toma en tu propia gpu y la empareja con tu guion; después eliges las buenas línea a línea con una sola tecla y exportas las elegidas como archivos numerados para fl studio, reaper o cualquier daw.',
  'drop your session wav here': 'suelta aquí el wav de tu sesión',
  'or press [[ctrl o]] to browse · any length · nothing is uploaded': 'o pulsa [[ctrl o]] para buscarlo · cualquier duración · no se sube nada',
  'a saved **.takekeeper.json** project can be dropped here too, then its wav': 'también puedes soltar aquí un proyecto **.takekeeper.json** guardado y después su wav',
  'forget the sorting for': 'olvidar la selección de',
  continue: 'continuar',
  '? the recording stays where it is': '? la grabación se queda donde está',
  keep: 'conservar',
  'yes, discard': 'sí, descartar',
  resume: 'reanudar',
  discard: 'descartar',
  'forget the saved sorting for this file': 'olvidar la selección guardada de este archivo',
  dismiss: 'cerrar',
  'reading file…': 'leyendo el archivo…',
  'listening for takes…': 'buscando tomas…',
  'switch to spanish': 'cambiar a español',
  'back to the landing': 'volver al inicio',
  tour: 'guía',
  skip: 'saltar',
  'keep it or drop it': 'quédate o tira',
  'takes play one after another. [[enter]] keeps one, [[⌫]] drops it.': 'las tomas suenan una tras otra. [[enter]] se queda con una, [[⌫]] la tira.',
  'lanes are your passes': 'los carriles son tus pasadas',
  'as many rounds as you want: each one keeps fewer takes, until the last lane holds one per line. [[tab]] changes lane, [[,]] renames them.':
    'tantas rondas como quieras: cada una guarda menos tomas, hasta que el último carril tenga una por línea. [[tab]] cambia de carril, [[,]] los renombra.',
  'script [[t]] · transcribe [[w]]': 'guion [[t]] · transcribir [[w]]',
  'paste your script and pick your character. whisper then reads every take on your own gpu, inside this page, and matches it to a line. nothing is uploaded.':
    'pega tu guion y elige tu personaje. whisper lee cada toma en tu propia gpu, dentro de esta página, y la empareja con una línea. no se sube nada.',
  'one line at a time [[g]]': 'una línea cada vez [[g]]',
  'hear every take of a line back to back and keep the best. [[shift ↑↓]] moves between lines.':
    'escucha seguidas todas las tomas de una línea y quédate con la mejor. [[shift ↑↓]] cambia de línea.',
  'report a bug': 'reportar un bug',
  'suggest a feature': 'sugerir una mejora',
  'switch to english': 'cambiar a inglés',
  Undo: 'deshecho',
  Redo: 'rehecho',
  'project loaded · {n} clips': 'proyecto cargado · {n} clips',

  // lanes
  Unsorted: 'sin ordenar',
  'Pass {n}': 'pasada {n}',
  Final: 'final',
  Junk: 'basura',
  Trash: 'papelera',

  // editor header, banner, info line
  'line {n} of {total}': 'línea {n} de {total}',
  'no takes': 'sin tomas',
  'this lane is empty': 'este carril está vacío',
  'shift ↑↓ changes line': 'shift ↑↓ cambia de línea',
  mono: 'mono',
  stereo: 'estéreo',
  '{n} ch': '{n} canales',
  'lane {n}': 'carril {n}',
  'auto-detected non-takes: enter rescues, backspace trashes': 'no-tomas detectadas automáticamente: enter rescata, retroceso tira',
  '{n} unsaved edit · save the project file': '{n} cambio sin guardar · guardar el archivo de proyecto',
  '{n} unsaved edits · save the project file': '{n} cambios sin guardar · guardar el archivo de proyecto',
  'save the project file': 'guardar el archivo de proyecto',
  save: 'guardar',
  export: 'exportar',
  '{n} min left': 'quedan {n} min',
  'w to cancel': 'w para cancelar',
  'junk · {n} clip found empty by transcription · enter rescues to unsorted · backspace trashes':
    'basura · {n} clip que la transcripción encontró vacío · enter rescata a sin ordenar · retroceso tira',
  'junk · {n} clips found empty by transcription · enter rescues to unsorted · backspace trashes':
    'basura · {n} clips que la transcripción encontró vacíos · enter rescata a sin ordenar · retroceso tira',
  '{lane} · {n} clip · enter promotes · backspace trashes · tab switches lane': '{lane} · {n} clip · enter sube · retroceso tira · tab cambia de carril',
  '{lane} · {n} clips · enter promotes · backspace trashes · tab switches lane': '{lane} · {n} clips · enter sube · retroceso tira · tab cambia de carril',
  'line {n}': 'línea {n}',
  transcript: 'transcripción',
  '×{n} reads': '×{n} lecturas',
  'false start': 'falso inicio',
  junk: 'basura',
  'no line · [[l]] marks the next line here': 'sin línea · [[l]] marca aquí la siguiente línea',
  '{lane} is empty · [[tab]] switches lanes': '{lane} está vacío · [[tab]] cambia de carril',
  'slow {r}×': 'lento {r}×',
  playing: 'reproduciendo',
  stopped: 'parado',
  loop: 'bucle',
  'by line': 'por línea',
  'enter rescues · ⌫ trashes': 'enter rescata · ⌫ tira',
  autoplay: 'autoplay',

  // toolbar
  pause: 'pausa',
  play: 'reproducir',
  slow: 'lento',
  'play clip from its start in slow motion': 'reproducir el clip desde el principio a cámara lenta',
  prev: 'anterior',
  'previous clip': 'clip anterior',
  next: 'siguiente',
  'move back': 'mover atrás',
  move: 'mover',
  'move forward': 'mover adelante',
  promote: 'subir',
  'move to the next lane': 'pasar al carril siguiente',
  demote: 'bajar',
  'move down one lane': 'bajar un carril',
  trash: 'tirar',
  'send to {lane}': 'enviar a {lane}',
  split: 'cortar',
  'split at the playhead': 'cortar en el cursor',
  'split, land on the other half': 'cortar y quedarse en la otra mitad',
  merge: 'unir',
  'merge with the next clip': 'unir con el clip siguiente',
  'merge prev': 'unir ant.',
  'merge with the previous clip': 'unir con el clip anterior',
  in: 'inicio',
  'set clip start at the playhead': 'poner el inicio del clip en el cursor',
  out: 'fin',
  'set clip end at the playhead': 'poner el fin del clip en el cursor',
  line: 'línea',
  'continue the script: the line after the furthest one so far': 'continuar el guion: la línea siguiente a la más avanzada hasta ahora',
  'this clip: one line back': 'este clip: una línea atrás',
  'line ±': 'línea ±',
  'this clip: one line forward': 'este clip: una línea adelante',
  'line №': 'línea nº',
  'jump to a line number': 'ir a un número de línea',
  'all clips': 'todos los clips',
  'line mode: one script line at a time': 'modo línea: una línea del guion cada vez',
  transcribe: 'transcribir',
  'whisper in the browser: transcribe takes and match them to lines': 'whisper en el navegador: transcribe las tomas y las empareja con las líneas',
  'next take with a doubtful line match': 'siguiente toma con una línea dudosa',
  'previous line': 'línea anterior',
  'next line': 'línea siguiente',
  undo: 'deshacer',
  redo: 'rehacer',
  'monitor gain down': 'bajar la ganancia de escucha',
  gain: 'ganancia',
  'monitor gain up': 'subir la ganancia de escucha',
  'loop on': 'bucle on',
  'repeat the current take until turned off': 'repetir la toma actual hasta desactivarlo',
  'autoplay on': 'autoplay on',
  'autoplay off': 'autoplay off',
  'toggle autoplay': 'activar o desactivar el autoplay',
  'all keys': 'todas las teclas',

  // script panel
  script: 'guion',
  'your character': 'tu personaje',
  'all spoken': 'todas las habladas',
  'show every row, not only your lines': 'mostrar todas las filas, no solo tus líneas',
  cues: 'pies',
  'transcribe takes and match them to lines': 'transcribir las tomas y emparejarlas con las líneas',
  done: 'listo',
  edit: 'editar',
  'paste the whole script here.\n\nrows like "mart: text" are spoken lines and the names become characters you can pick; other rows are directions. no names at all? every row counts as yours.\n\nthen press l on the first take of each of your lines while you listen.':
    'pega aquí el guion completo.\n\nlas filas tipo "mart: texto" son líneas habladas y los nombres se convierten en personajes que puedes elegir; el resto son acotaciones. ¿sin nombres? todas las filas cuentan como tuyas.\n\ndespués pulsa l en la primera toma de cada una de tus líneas mientras escuchas.',
  'no script yet. press [[t]] to paste one.': 'aún no hay guion. pulsa [[t]] para pegar uno.',
  'rows like **mart: text** become your lines once you pick the character. while listening, press [[l]] on the first take of each line; every clip after it inherits that line. [[[]] [[]]] fix a take you went back for.':
    'las filas tipo **mart: texto** se convierten en tus líneas cuando eliges el personaje. mientras escuchas, pulsa [[l]] en la primera toma de cada línea; los clips siguientes heredan esa línea. [[[]] [[]]] corrigen una toma a la que volviste.',
  'pick your character above · until then every spoken line counts as yours': 'elige tu personaje arriba · hasta entonces todas las líneas habladas cuentan como tuyas',
  'click: back to the whole lane': 'clic: volver al carril completo',
  "click: only this line's takes · shift+click: give the current take this line": 'clic: solo las tomas de esta línea · shift+clic: asignar esta línea a la toma actual',
  'takes per lane': 'tomas por carril',

  // settings
  'saved in this browser. detection changes apply when you press re-detect.': 'se guardan en este navegador. los cambios de detección se aplican al pulsar re-detectar.',
  detection: 'detección',
  'silence threshold': 'umbral de silencio',
  'quieter than this is silence.': 'por debajo de esto es silencio.',
  ' this file: floor ≈ {floor} db, peak ≈ {peak} db.': ' este archivo: suelo ≈ {floor} db, pico ≈ {peak} db.',
  'minimum silence': 'silencio mínimo',
  'shorter pauses stay inside a take.': 'las pausas más cortas se quedan dentro de la toma.',
  margin: 'margen',
  'room tone kept on each side of a take.': 'sonido de sala que se conserva a cada lado de la toma.',
  'fade at cuts': 'fundido en los cortes',
  'tiny fade so edits never click. 0 = hard cuts.': 'un fundido mínimo para que los cortes no hagan clic. 0 = cortes secos.',
  're-detect with these settings': 're-detectar con estos ajustes',
  '{preview} takes with these settings · {current} now. unchanged clips keep their lane and line.':
    '{preview} tomas con estos ajustes · {current} ahora. los clips que no cambian conservan carril y línea.',
  're-detect': 're-detectar',
  listening: 'escucha',
  'monitor gain': 'ganancia de escucha',
  'for quiet takes. never touches exports. [[=]] and [[-]] while listening.': 'para tomas flojas. nunca afecta a la exportación. [[=]] y [[-]] mientras escuchas.',
  'slow-motion speed': 'velocidad de cámara lenta',
  'tape-style: pitch drops with speed.': 'como una cinta: el tono baja con la velocidad.',
  'slow motion on [[↑]]': 'cámara lenta con [[↑]]',
  'replay the previous clip at the slow speed. [[shift space]] always does.': 'repite el clip anterior a la velocidad lenta. [[shift space]] siempre lo hace.',
  'line mode wraps around': 'el modo línea da la vuelta',
  'on the last take of a line, [[↓]] goes back to the first. off stops there. autoplay always stops.':
    'en la última toma de una línea, [[↓]] vuelve a la primera. desactivado se queda ahí. el autoplay siempre para.',
  'back to the first take': 'vuelta a la primera toma',
  'back to the last take': 'vuelta a la última toma',
  'continue to the next clip when one finishes.': 'pasa al clip siguiente cuando uno termina.',
  transcription: 'transcripción',
  'empty takes go to junk': 'las tomas vacías van a basura',
  'breaths, slates and false starts with no words move to the junk lane for a quick review.':
    'respiraciones, claquetas y falsos inicios sin palabras pasan al carril de basura para revisarlos rápido.',
  're-cut takes with several reads': 're-cortar tomas con varias lecturas',
  'a take that repeats its line is cut at the pauses inside it, then what is left is re-cut by word: reads with no pause between them, false starts, and lines a pause split in two.':
    'una toma que repite su línea se corta en las pausas internas y después lo que queda se re-corta por palabras: lecturas sin pausa entre ellas, falsos inicios y líneas que una pausa partió en dos.',
  editing: 'edición',
  'frame step': 'paso',
  'one frame. alt steps a tenth of it.': 'un paso. alt avanza una décima.',
  'arrows move fast': 'las flechas van rápido',
  '[[←]] [[→]] jump ten frames; [[shift]] steps one frame, precise. off swaps them.':
    '[[←]] [[→]] saltan diez pasos; [[shift]] avanza un paso, preciso. desactivado los intercambia.',
  'split stays on the first half': 'al cortar, quedarse en la primera mitad',
  'after [[s]], review the part before the cut. off moves on to the part after it. [[shift s]] does the opposite of this setting for one split.':
    'tras [[s]] revisas la parte anterior al corte. desactivado pasa a la parte posterior. [[shift s]] hace lo contrario de este ajuste por un corte.',
  'context around a clip': 'contexto alrededor del clip',
  'audio shown before and after, so you can extend a cut.': 'audio que se muestra antes y después, para poder ampliar un corte.',
  'lanes & look': 'carriles y aspecto',
  'lane names': 'nombres de los carriles',
  'comma-separated. first is the inbox, last is final. keys 1–9 send clips to them.':
    'separados por comas. el primero es la entrada, el último es el final. las teclas 1–9 envían clips a ellos.',
  theme: 'tema',
  auto: 'auto',
  dark: 'oscuro',
  light: 'claro',
  language: 'idioma',
  'the whole interface. auto follows the page you opened.': 'toda la interfaz. auto sigue la página que abriste.',
  close: 'cerrar',

  // export
  'clips are numbered in script order, then by recording time within a line, so sorting by name plays your lines in order.':
    'los clips se numeran en el orden del guion y, dentro de una línea, por tiempo de grabación, así que ordenar por nombre reproduce tus líneas en orden.',
  'clips are numbered in recording order, so sorting by name keeps them chronological.':
    'los clips se numeran en orden de grabación, así que ordenar por nombre los mantiene cronológicos.',
  order: 'orden',
  'by line: script order, recording order within a line. takes without a line go last.':
    'por línea: orden del guion y, dentro de una línea, orden de grabación. las tomas sin línea van al final.',
  'recording order; by line becomes available once takes have lines (marks or transcription).':
    'orden de grabación; por línea se activa cuando las tomas tienen líneas (marcas o transcripción).',
  'by time': 'por tiempo',
  lane: 'carril',
  format: 'formato',
  '{n} clips · {dur}': '{n} clips · {dur}',
  ' · {n} gap · {dur} of silence': ' · {n} hueco · {dur} de silencio',
  ' · {n} gaps · {dur} of silence': ' · {n} huecos · {dur} de silencio',
  folder: 'carpeta',
  zip: 'zip',
  'one file': 'un archivo',
  'file name prefix': 'prefijo del nombre de archivo',
  'gap between clips': 'hueco entre clips',
  'silence inserted between takes in the merged file.': 'silencio insertado entre tomas en el archivo unido.',
  'project file': 'archivo de proyecto',
  'lanes, cuts, line marks and script': 'carriles, cortes, marcas de línea y guion',
  'saved in this browser automatically, but a file is safer: keep it next to the wav and drop it on the landing page to pick up where you left off. [[ctrl s]] anywhere.':
    'se guardan solos en este navegador, pero un archivo es más seguro: tenlo junto al wav y suéltalo en la página de inicio para seguir donde lo dejaste. [[ctrl s]] en cualquier momento.',
  'save project': 'guardar proyecto',
  'silent gaps between takes': 'huecos de silencio entre tomas',
  'tiny silent wav files, numbered to sort in place, so the folder drops into the daw with the spacing already there.':
    'pequeños wav de silencio, numerados para ordenarse en su sitio, así la carpeta cae en el daw con la separación ya puesta.',
  'after every take / between lines': 'tras cada toma / entre líneas',
  'seconds. the longer gap is used when the next take is a different line.': 'segundos. el hueco largo se usa cuando la toma siguiente es de otra línea.',
  'into fl studio': 'a fl studio',
  'in the browser, sort the folder **by name** and select every file.': 'en el explorador, ordena la carpeta **por nombre** y selecciona todos los archivos.',
  'hold **shift** while dropping them onto the playlist; they land on one track, in order.':
    'mantén **shift** al soltarlos en el playlist; caen en una sola pista, en orden.',
  'turn on **ripple edit** so deleting a clip closes the gap.': 'activa **ripple edit** para que al borrar un clip se cierre el hueco.',
  'building merged file…': 'creando el archivo unido…',
  'saving…': 'guardando…',
  'merged file saved.': 'archivo unido guardado.',
  'preparing clips…': 'preparando clips…',
  'packing zip…': 'empaquetando zip…',
  '{n} clips zipped.': '{n} clips en el zip.',
  'writing files…': 'escribiendo archivos…',
  '{n} files written.': '{n} archivos escritos.',
  'this lane is empty · pick another above': 'este carril está vacío · elige otro arriba',
  'pick a folder; files are written directly into it.': 'elige una carpeta; los archivos se escriben directamente en ella.',
  'save to folder': 'guardar en carpeta',
  'download zip': 'descargar zip',
  'save file': 'guardar archivo',

  // help
  'everything acts on the clip under the amber playhead.': 'todo actúa sobre el clip bajo el cursor ámbar.',
  'play / pause': 'reproducir / pausa',
  'play clip from start, slow': 'reproducir el clip desde el inicio, lento',
  'next clip': 'clip siguiente',
  'move the playhead (ten frames)': 'mover el cursor (diez pasos)',
  'one frame, precise / a tenth': 'un paso, preciso / una décima',
  'clip start / end': 'inicio / fin del clip',
  'loop the current take': 'repetir la toma actual en bucle',
  'monitor gain up / down': 'ganancia de escucha arriba / abajo',
  'promote to next lane': 'subir al carril siguiente',
  'demote one lane': 'bajar un carril',
  'send to lane n': 'enviar al carril n',
  'split at playhead / land on the other half': 'cortar en el cursor / quedarse en la otra mitad',
  'merge with next / previous': 'unir con el siguiente / anterior',
  'set clip start / end here': 'poner aquí el inicio / fin del clip',
  'undo / redo': 'deshacer / rehacer',
  'continue the script: next line starts here': 'continuar el guion: la siguiente línea empieza aquí',
  'this clip: one line back / forward': 'este clip: una línea atrás / adelante',
  'jump to line number': 'ir a un número de línea',
  'line mode: one line at a time': 'modo línea: una línea cada vez',
  'in line mode: previous / next line': 'en modo línea: línea anterior / siguiente',
  'transcribe takes and match lines': 'transcribir tomas y emparejar líneas',
  'next doubtful line match': 'siguiente línea dudosa',
  'junk lane: rescue / confirm trash': 'carril basura: rescatar / confirmar a papelera',
  'edit script': 'editar el guion',
  'switch lane': 'cambiar de carril',
  'open a file': 'abrir un archivo',
  'stop / close': 'parar / cerrar',

  // transcribe
  'whisper runs on your gpu, inside this page. the model downloads once ({size}) and is cached; your audio never leaves the machine. afterwards every take is matched to one of your lines, empty takes go to the junk lane, takes with several reads are re-cut at the pauses, and the leftovers are re-cut by word: reads with no pause between them, false starts, and lines a pause split in two.':
    'whisper se ejecuta en tu gpu, dentro de esta página. el modelo se descarga una vez ({size}) y queda en caché; tu audio nunca sale de tu equipo. después cada toma se empareja con una de tus líneas, las tomas vacías van al carril de basura, las tomas con varias lecturas se re-cortan en las pausas, y el resto se re-corta por palabras: lecturas sin pausa entre ellas, falsos inicios y líneas que una pausa partió en dos.',
  'what the takes are spoken in.': 'el idioma en que están las tomas.',
  spanish: 'español',
  english: 'inglés',
  model: 'modelo',
  'small is the safe choice for spanish; base is roughly three times faster.': 'small es la opción segura para español; base es unas tres veces más rápido.',
  'runs on': 'se ejecuta en',
  '{n}/{total} transcribed': '{n}/{total} transcritas',
  'checking…': 'comprobando…',
  ' · about {n} min left': ' · quedan unos {n} min',
  'you can keep sorting while it runs; the banner shows progress.': 'puedes seguir seleccionando mientras corre; la barra superior muestra el progreso.',
  'paste the script first (t) so takes have lines to match.': 'pega primero el guion (t) para que las tomas tengan líneas con las que emparejarse.',
  cancel: 'cancelar',
  'use the stored transcripts; no gpu time': 'usa las transcripciones guardadas; sin gpu',
  're-match lines': 're-emparejar líneas',
  'word timestamps on flagged takes: split reads with no pause, separate false starts, merge split lines':
    'tiempos por palabra en las tomas marcadas: separa lecturas sin pausa, aparta falsos inicios, une líneas partidas',
  're-cut by words': 're-cortar por palabras',
  'only new takes': 'solo las tomas nuevas',
  'transcribe all again': 're-transcribir todo',
  'transcribe all takes': 'transcribir todas las tomas',
  'cpu · no webgpu, expect it to be slow': 'cpu · sin webgpu, será lento',
  'warming up': 'calentando',
  'downloading model · {a} / {b} MB': 'descargando el modelo · {a} / {b} MB',
  'transcription failed': 'la transcripción falló',

  // goto
  'your line number': 'tu número de línea',
  'this clip and the ones after it. 0 removes the mark.': 'este clip y los siguientes. 0 quita la marca.',
  'set line': 'fijar línea',

  // store toasts and statuses
  'monitor {db} db': 'escucha {db} db',
  'resumed · {n} clips': 'reanudado · {n} clips',
  '{n} takes found': '{n} tomas encontradas',
  'That file changed on disk since last time - pick it again to start fresh.': 'Ese archivo cambió en el disco desde la última vez: elígelo otra vez para empezar de cero.',
  'Pick "{name}" again to resume where you left off.': 'Elige "{name}" otra vez para seguir donde lo dejaste.',
  'project loaded · now drop {name}': 'proyecto cargado · ahora suelta {name}',
  'project saved': 'proyecto guardado',
  'forgot {name}': 'olvidado {name}',
  'nothing to undo': 'nada que deshacer',
  'nothing to redo': 'nada que rehacer',
  'no takes of line {n} in {lane} · g shows the whole lane': 'sin tomas de la línea {n} en {lane} · g muestra el carril completo',
  'lane is empty': 'el carril está vacío',
  'end of lane': 'fin del carril',
  'start of lane': 'inicio del carril',
  'loop on · this take repeats': 'bucle on · esta toma se repite',
  'loop on · play repeats this take': 'bucle on · reproducir repite esta toma',
  'loop off': 'bucle off',
  'already in {lane}': 'ya está en {lane}',
  '→ {lane}': '→ {lane}',
  ' · line {n} · {text}': ' · línea {n} · {text}',
  '{lane} is empty': '{lane} está vacío',
  'no such lane': 'no existe ese carril',
  'move the playhead inside the clip to split': 'mueve el cursor dentro del clip para cortar',
  Split: 'cortado',
  'no next clip in this lane': 'no hay clip siguiente en este carril',
  'merged with next': 'unido con el siguiente',
  'no previous clip in this lane': 'no hay clip anterior en este carril',
  'merged with previous': 'unido con el anterior',
  'start must be before the end': 'el inicio debe ir antes del fin',
  'start → {t}': 'inicio → {t}',
  'end must be after the start': 'el fin debe ir después del inicio',
  'end → {t}': 'fin → {t}',
  'no script yet · press t to paste one': 'aún no hay guion · pulsa t para pegar uno',
  'last line': 'última línea',
  'first line': 'primera línea',
  'you only have {n} lines': 'solo tienes {n} líneas',
  'playing {name}': 'haces de {name}',
  'all spoken lines': 'todas las líneas habladas',
  'line {n}: no takes in {lane}': 'línea {n}: sin tomas en {lane}',
  ' · {n} in total': ' · {n} en total',
  'line {n} · {k} take here': 'línea {n} · {k} toma aquí',
  'line {n} · {k} takes here': 'línea {n} · {k} tomas aquí',
  'line mark removed': 'marca de línea quitada',
  '{n} takes': '{n} tomas',
  'paste the script first · t': 'pega primero el guion · t',
  transcribing: 'transcribiendo',
  're-cut {n} pieces · transcribing them': '{n} trozos re-cortados · transcribiéndolos',
  'by word: {a} split · {b} merged': 'por palabras: {a} cortes · {b} uniones',
  'stopped · {n} takes transcribed, lines not re-matched': 'parado · {n} tomas transcritas, líneas sin re-emparejar',
  '{n} takes transcribed · {u} uncertain · u jumps to them': '{n} tomas transcritas · {u} dudosas · u salta a ellas',
  'loading {model} model on {device}': 'cargando el modelo {model} en {device}',
  'refining cuts by word': 'afinando cortes por palabras',
  'nothing transcribed yet · w': 'aún no hay nada transcrito · w',
  're-cut by words · {a} split · {b} merged · {u} uncertain': 're-cortado por palabras · {a} cortes · {b} uniones · {u} dudosas',
  '{n} empty takes moved to junk': '{n} tomas vacías movidas a basura',
  'lines re-matched · {u} uncertain': 'líneas re-emparejadas · {u} dudosas',
  '{n} takes with several reads re-cut into {m}': '{n} tomas con varias lecturas re-cortadas en {m}',
  'no uncertain takes in this lane': 'no hay tomas dudosas en este carril',

  // file errors
  'That is not a takekeeper project file.': 'Eso no es un archivo de proyecto de takekeeper.',
  'RF64 WAV files (over 4 GB) are not supported yet.': 'Los WAV RF64 (más de 4 GB) aún no están soportados.',
  'Unsupported WAV encoding - only PCM and float WAV are supported.': 'Codificación WAV no soportada: solo PCM y float.',
  'Unsupported bit depth: {bits}-bit.': 'Profundidad de bits no soportada: {bits} bits.',
  'Only 32-bit float WAV is supported.': 'Solo se soporta WAV float de 32 bits.',
  'Could not find the audio data in this WAV file.': 'No se encontraron los datos de audio en este WAV.',
  'Compressed files over 250 MB cannot be decoded in the browser. Convert to WAV first.':
    'Los archivos comprimidos de más de 250 MB no se pueden decodificar en el navegador. Conviértelo a WAV primero.',
  'Could not decode this file. WAV works best; MP3, FLAC, OGG and M4A work for shorter recordings.':
    'No se pudo decodificar este archivo. WAV es lo mejor; MP3, FLAC, OGG y M4A valen para grabaciones cortas.',
  'This compressed file is too long to decode in the browser. Convert it to WAV first.':
    'Este archivo comprimido es demasiado largo para decodificarlo en el navegador. Conviértelo a WAV primero.',
  'ZIP would exceed 4 GB / 65535 files. Use Save to folder instead.': 'El ZIP superaría 4 GB / 65535 archivos. Usa guardar en carpeta.',
} as const;

export type Key = keyof typeof es;
type Vars = Record<string, string | number>;

let current: Lang = 'en';

/** The language of the page that was opened: /es/ is Spanish, everything else English. */
export const PAGE_LANG: Lang = typeof document !== 'undefined' && document.documentElement.lang.startsWith('es') ? 'es' : 'en';

export const resolveLang = (setting: LangSetting): Lang => (setting === 'auto' ? PAGE_LANG : setting);

export const langUrl = (l: Lang) => (l === 'es' ? '/es/' : '/');

/** The language the browser asks for. */
export const browserLang = (): Lang => ((navigator.languages?.[0] ?? navigator.language ?? '').toLowerCase().startsWith('es') ? 'es' : 'en');

/**
 * Where a visitor should be, or null to stay. A chosen language always wins. On auto, a Spanish browser
 * opening the English page goes to /es/; the reverse never redirects, so crawlers (English) reach /es/.
 */
export function redirectFor(setting: LangSetting, page: Lang, browser: Lang): string | null {
  if (setting !== 'auto') return setting === page ? null : langUrl(setting);
  return page === 'en' && browser === 'es' ? langUrl('es') : null;
}

export function setLang(l: Lang) {
  current = l;
}

export const lang = (): Lang => current;

export function t(key: Key, vars?: Vars): string {
  let s: string = current === 'es' ? es[key] : key;
  if (vars) for (const [k, v] of Object.entries(vars)) s = s.split(`{${k}}`).join(String(v));
  return s;
}

/** Display name of a lane: the default English names translate, custom names show as typed. */
export function laneLabel(name: string): string {
  const n = name.trim();
  if (current === 'en') return n.toLowerCase();
  const pass = /^pass\s*(\d+)$/i.exec(n);
  if (pass) return t('Pass {n}', { n: pass[1] });
  for (const k of ['Unsorted', 'Final', 'Junk', 'Trash'] as const) if (k.toLowerCase() === n.toLowerCase()) return t(k);
  return n.toLowerCase();
}

/** [[x]] becomes a key cap, **x** bold. */
export function rich(s: string): ComponentChildren {
  const out: ComponentChildren[] = [];
  const re = /\[\[(.+?)\]\]|\*\*(.+?)\*\*/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(s))) {
    if (m.index > last) out.push(s.slice(last, m.index));
    out.push(m[1] !== undefined ? <kbd>{m[1]}</kbd> : <b>{m[2]}</b>);
    last = re.lastIndex;
  }
  if (last < s.length) out.push(s.slice(last));
  return out;
}

export const T = ({ k, v }: { k: Key; v?: Vars }) => <>{rich(t(k, v))}</>;
