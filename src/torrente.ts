// Torrente personality — phrase pools per context
// Use torrente("context") for a random phrase, or torrente("context", { key: value }) for interpolation

const phrases: Record<string, string[]> = {
  song_added: [
    "Venga, la meto en la cola, {title}. Como el que espera pa mear en el chino, chaval.",
    "Cola pa la {title}. Que espere como todo el mundo, como cuando hay cola en el Carrefour y yo me cuelo.",
    "Añadida a la cola: **{title}**. No te pongas chulo que aquí mando yo, desgraciado.",
    "**{title}** a la cola. Tú espera tu turno, pringao, que yo soy el que lleva la batuta aquí.",
    "Metida la {title} en cola. Ahora relájate y cómprate una caña que yo me encargo, fenómeno.",
  ],

  song_playing: [
    "¡Dale al **{title}**! Esto sí es música, no las mariconadas del reggaeton. ¡Viva el Atleti!",
    "Poniendo **{title}**. Que sepas que yo también sé de música, chaval, no solo de patrullar.",
    "Ahí va **{title}**. Esto sí que mola, me cago en todo lo que se menea. ¡Viva el Fary!",
    "**{title}**, qué temazo. Casi tan bueno como el Fary. Casi, ¿eh?, que no hay quien le iguale.",
    "Suena **{title}**. Mientras yo me como una corteza con mermelada en el chino de abajo.",
  ],

  now_playing: [
    "▶️ Apatrullando los oídos con **{title}** — reacciona ⏭️ pa votar skip, desgraciados",
    "▶️ En antena: **{title}** (pedida por {requestedBy}) — ⏭️ si no os mola, pajilleros",
    "▶️ Sonando: **{title}** — pedida por {requestedBy}. Votar skip con ⏭️, caracartones",
  ],

  now_playing_autodj: [
    "🤖 El DJ Torrente recomienda: **{title}**. Y no se discute, ¿eh? Soy un experto.",
    "🤖 Torrente en modo automático: **{title}**. Chu-shi-su. Eso es nivel, chaval.",
    "🤖 Auto-DJ con clase: **{title}**. Como yo cuando patrullaba el barrio, con criterio.",
  ],

  skip: [
    "⏭️ Siguiente. **{title}** era peor que el olor de mi sobaquillo después de un turno de 12 horas.",
    "⏭️ Saltando **{title}**. Me cago en todo lo que se menea, chaval, eso era un bodrio.",
    "⏭️ Fuera **{title}**. Eso me ha ofendido más que cuando me quitaron el carnet de policía.",
    "⏭️ Skipeada **{title}**. Ni el Fary en sus peores días hacía algo tan malo, desgraciado.",
  ],

  vote_skip: [
    "⏭️ Democracia, chaval. El pueblo ha hablao y **{title}** se va a tomar por saco.",
    "⏭️ Han votao ({votes}/{threshold}). Se acabó **{title}**, que le den. ¡Viva el Atleti!",
    "⏭️ Votación completada ({votes}/{threshold}). Saltando **{title}**. Me cago en la democracia pero funciona.",
  ],

  stop: [
    "⏹️ Me piro, vampiro. Os quedáis sin DJ, desgraciados. Voy a cenar al chino.",
    "⏹️ Para todo. Me cago en todo lo que se menea, que tengo que ir a patrullar.",
    "⏹️ Hasta aquí. Me voy a tomar una caña y a ver el Atleti, fenómenos.",
    "⏹️ Se acabó la fiesta. Invitadme a un pincho de tortilla y quizá vuelva, caracartones.",
  ],

  pause: [
    "⏸️ Pausa pa mear. Me lavo las manos antes, ¿eh? La polla es sagrada, chaval.",
    "⏸️ Pausao. Voy a sacarme el palillo de la boca y a pensar en la vida, desgraciado.",
    "⏸️ Para. Que me huele el sobaquillo y necesito airearme un momento.",
    "⏸️ Pausa técnica. Es que tengo hambre y me he quedado sin corteza.",
  ],

  resume: [
    "▶️ Venga, seguimos apatrullando. Que no se diga que Torrente abandona el puesto.",
    "▶️ Dale, reanudamos. Ya he meao y todo está en orden, fenómeno.",
    "▶️ Sigue la música. Chu-shi-su. Eso es lo que hay, desgraciado.",
    "▶️ Arrancamos. Me he comido una aceituna y ya estoy listo pa todo, chaval.",
  ],

  queue_header: [
    "**Cola de música** (apatrullada por Torrente):",
    "**Lo que toca escuchar, fenómenos:**",
    "**La cola, que os habéis creído que soy vuestro criado:**",
    "**Peticiones de los pringaos:**",
  ],

  queue_empty: [
    "La cola está más vacía que mi cartera después de pagar una ronda, chaval.",
    "No hay nada en la cola. ¿Qué hacéis aquí parados, desgraciados? Poned algo.",
    "Cola vacía. Como mi nevera. Alguien que me invite a algo, me cago en todo.",
  ],

  autodj_on: [
    "🤖 Auto-DJ activao. Déjame a mí, que tengo un gusto musical limítrofe. Chu-shi-su.",
    "🤖 Modo automático ON. Torrente al mando. Vais a flipar, pajilleros.",
    "🤖 Auto-DJ encendido. Cuando se acabe la cola yo busco canciones. Fijaos qué nivel.",
  ],

  autodj_off: [
    "🤖 Auto-DJ apagao. Vale, ya eliges tú, pringao. A ver qué pones.",
    "🤖 Modo automático OFF. Espero que vuestro gusto musical sea mejor que vuestra higiene.",
    "🤖 Auto-DJ parao. Ahora a espabilar vosotros, desgraciados.",
  ],

  autodj_no_state: [
    "No hay nada reproduciéndose, chaval. Pon algo primero, que no soy adivino.",
    "¿Qué Auto-DJ ni qué hostias? No hay música. Empieza por ahí, fenómeno.",
    "Primero pon una canción, desgraciado. Luego ya hablamos del Auto-DJ.",
  ],

  ranking_header: [
    "🏆 **Ranking de pesetas** — a ver quién es el menos pringao del servidor:",
    "🏆 **Los ricachones del servidor** — que sepáis que yo os vigilaba a todos:",
    "🏆 **Clasificación de fenómenos** — el que más pesetas tiene es el menos desgraciado:",
    "🏆 **Pesetas del servidor** — yo el primero debería estar pero me las robaron, me cago en todo:",
  ],

  ranking_empty: [
    "Aún no hay nadie en el ranking. Qué panda de vagos, ni pesetas tenéis, desgraciados.",
    "El ranking está vacío. Como la cabeza de algunos que yo conozco. Ponte en un canal de voz, fenómeno.",
  ],

  audio_joining: [
    "🎙️ Voy pa allá, callaos que llega Torrente.",
    "🎙️ Uniéndome... me estoy ajustando el palillo antes de entrar.",
    "🎙️ Ahí voy. Que no cunda el pánico, desgraciados.",
  ],

  audio_playing: [
    "🎙️ ¡Ahí va! Atentos, fenómenos.",
    "🎙️ Sonando. Esto sí que es nivel, chaval.",
    "🎙️ ¡Dale! Esto lo escucha hasta el Fary.",
  ],

  error_no_voice: [
    "¿Pero dónde estás, desgraciado? Métete en un canal de voz primero.",
    "No estás en ningún canal de voz, fenómeno. ¿Dónde quieres que vaya, al váter?",
    "Chaval, entra en un canal de voz. No puedo seguirte a todas partes, que no soy tu sombra.",
    "¿Un canal de voz? ¿Conoces eso, pajillero? Métete en uno y luego hablamos.",
  ],

  error_no_music: [
    "No hay nada reproduciéndose, desgraciado. ¿Qué quieres que skipe, el silencio?",
    "No estoy reproduciendo nada, chaval. Pon algo primero.",
    "Cola vacía. No hay ná. ¿Pero qué te has creído, fenómeno?",
  ],

  error_not_paused: [
    "No hay nada pausado, fenómeno. Estás viendo visiones.",
    "¿Reanudar qué, chaval? No hay nada pausado. Me cago en todo.",
    "No estaba pausao nada, desgraciado. A ver si espabilas.",
  ],

  error_not_playing: [
    "No estoy reproduciendo nada, pringao. Pon una canción primero.",
    "No hay nada sonando, fenómeno. ¿Qué quieres que pause?",
  ],

  error_not_connected: [
    "No estoy en ningún canal, desgraciado. ¿Qué quieres que pare?",
    "No estoy reproduciendo ná, chaval. Relájate.",
  ],

  error_resolve: [
    "No encontré esa canción, fenómeno. Intenta con otro nombre o URL, que no soy mago.",
    "Me cago en todo lo que se menea, no encuentro eso. Pon otra cosa, desgraciado.",
    "Eso no existe o YouTube no quiere saber ná. Prueba con otra búsqueda, pringao.",
  ],

  error_voice_connect: [
    "No pude unirme al canal de voz. Me cago en la tecnología moderna, desgraciado.",
    "Error al conectarme. ¿Ves? Por esto España se va a la mierda. Inténtalo otra vez, chaval.",
  ],

  error_generic: [
    "Me cago en todo lo que se menea. Algo ha petao, chaval.",
    "Error. Y yo que sé. La tecnología es cosa de pringaos. Inténtalo otra vez, fenómeno.",
    "Algo ha fallao, desgraciado. No es culpa mía, es culpa del sistema.",
  ],

  roulette_pick: [
    "🎰 Muy bien, {amount} pesetas. ¿A qué apostamos, fenómeno? Elige antes de que me arrepienta.",
    "🎰 {amount} pesetas sobre la mesa. ¿Qué tipo de apuesta, desgraciado? Elige o me voy al chino.",
    "🎰 Ahí van {amount} pesetas. Vamos a ver si tienes suerte o eres un pringao de los de siempre.",
  ],

  roulette_spinning: [
    "🎰 Ahí va la bolita... Me cago en la ruleta, esto es mejor que el bingo del barrio. Espera, chaval...",
    "🎰 Girando... Chu-shi-su. La física newtoniana manda, desgraciado. Ya veremos...",
    "🎰 La bolita rueda... Yo ya sé el resultado pero no te lo digo. Aguanta, fenómeno...",
    "🎰 Girando la ruleta... Voy a rezarle al Fary por si acaso. Un momento, chaval...",
  ],

  roulette_win: [
    "🎉 ¡**{number}** — {zone}! ¡HAS GANAO, FENÓMENO! +{profit} pesetas. ¡Viva el Atleti y el Fary!",
    "🎉 ¡Sale el **{number}** — {zone}! ¡Toma castaña, desgraciado! +{profit} pesetas en tu bolsillo.",
    "🎉 ¡**{number}** — {zone}! ¡Qué suertudo eres, pringao! Te llevas {profit} pesetas. Invítame a una caña.",
    "🎉 ¡**{number}** — {zone}! ¡Madre mía, has ganao! +{profit} pesetas. Esto no pasa ni en el Calderón.",
  ],

  roulette_lose: [
    "💀 Sale el **{number}** — {zone}. Has perdido {amount} pesetas, caracartón. Eso te pasa por no rezarle al Fary.",
    "💀 **{number}** — {zone}. Perdiste {amount} pesetas, desgraciado. La ruleta no es pa pringaos como tú.",
    "💀 **{number}** — {zone}. Se fueron {amount} pesetas, chaval. ¿Ves? España se va a la mierda.",
    "💀 **{number}** — {zone}. {amount} pesetas menos, fenómeno. Vete a trabajar un rato y cierra la boca.",
  ],

  roulette_no_funds: [
    "No tienes ni pa pipas, chaval. Necesitas {amount} pesetas y llevas {balance}. Vete al canal de voz.",
    "¿Con qué dinero, desgraciado? Llevas {balance} pesetas y quieres apostar {amount}. Me parto.",
    "Eso no te lo puedo aceptar, fenómeno. Te faltan pesetas. Métete en un canal de voz y trabaja.",
  ],

  roulette_invalid_number: [
    "¿Qué número es ese, fenómeno? Del 0 al 36, que esto es una ruleta, no el bingo del barrio.",
    "Ese número no existe en una ruleta, desgraciado. Del 0 al 36. Aprende.",
    "¿Del 0 al 36 es tan difícil, chaval? Pon un número que exista.",
  ],
};

function pick(pool: string[]): string {
  return pool[Math.floor(Math.random() * pool.length)];
}

function interpolate(template: string, vars: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (_, key) => vars[key] ?? `{${key}}`);
}

export function torrente(context: string, vars?: Record<string, string>): string {
  const pool = phrases[context];
  if (!pool || pool.length === 0) {
    console.warn(`[Torrente] Unknown context: ${context}`);
    return "...";
  }
  const phrase = pick(pool);
  return vars ? interpolate(phrase, vars) : phrase;
}
