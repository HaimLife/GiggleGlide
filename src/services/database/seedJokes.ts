import { Joke } from './types';

/**
 * Comprehensive seed jokes dataset with 100+ jokes
 * Each joke is tagged with style, format, topic, tone
 * Supports multiple languages: EN, ES, FR
 */
export const SEED_JOKES: Omit<Joke, 'id' | 'created_at'>[] = [
  // English Jokes - Dad Style
  {
    txt: "Why don't scientists trust atoms? Because they make up everything!",
    lang: 'en',
    style: 'dad',
    format: 'qa',
    topic: 'science',
    tone: 'silly',
    creator: 'seed'
  },
  {
    txt: "I'm reading a book about anti-gravity. It's impossible to put down!",
    lang: 'en',
    style: 'dad',
    format: 'text',
    topic: 'science',
    tone: 'silly',
    creator: 'seed'
  },
  {
    txt: "Why did the scarecrow win an award? He was outstanding in his field!",
    lang: 'en',
    style: 'dad',
    format: 'qa',
    topic: 'work',
    tone: 'silly',
    creator: 'seed'
  },
  {
    txt: "What do you call a fake noodle? An impasta!",
    lang: 'en',
    style: 'dad',
    format: 'qa',
    topic: 'food',
    tone: 'silly',
    creator: 'seed'
  },
  {
    txt: "I used to hate facial hair, but then it grew on me.",
    lang: 'en',
    style: 'dad',
    format: 'text',
    topic: 'everyday',
    tone: 'silly',
    creator: 'seed'
  },

  // English Jokes - Puns
  {
    txt: "I wondered why the baseball was getting bigger. Then it hit me.",
    lang: 'en',
    style: 'pun',
    format: 'text',
    topic: 'sports',
    tone: 'clever',
    creator: 'seed'
  },
  {
    txt: "What did the grape say when it got stepped on? Nothing, it just let out a little wine!",
    lang: 'en',
    style: 'pun',
    format: 'qa',
    topic: 'food',
    tone: 'clever',
    creator: 'seed'
  },
  {
    txt: "I told my wife she was drawing her eyebrows too high. She looked surprised.",
    lang: 'en',
    style: 'pun',
    format: 'text',
    topic: 'family',
    tone: 'witty',
    creator: 'seed'
  },
  {
    txt: "Why don't eggs tell jokes? They'd crack each other up!",
    lang: 'en',
    style: 'pun',
    format: 'qa',
    topic: 'food',
    tone: 'silly',
    creator: 'seed'
  },
  {
    txt: "The math teacher called in sick with algebra. I hope it's not terminal!",
    lang: 'en',
    style: 'pun',
    format: 'text',
    topic: 'work',
    tone: 'clever',
    creator: 'seed'
  },

  // English Jokes - Observational
  {
    txt: "Why do we park in driveways and drive on parkways?",
    lang: 'en',
    style: 'observational',
    format: 'qa',
    topic: 'everyday',
    tone: 'witty',
    creator: 'seed'
  },
  {
    txt: "If you think about it, being early is just being on time with anxiety.",
    lang: 'en',
    style: 'observational',
    format: 'text',
    topic: 'everyday',
    tone: 'witty',
    creator: 'seed'
  },
  {
    txt: "Social media is the only place where you can get 1000 friends and still feel lonely.",
    lang: 'en',
    style: 'observational',
    format: 'text',
    topic: 'technology',
    tone: 'witty',
    creator: 'seed'
  },
  {
    txt: "Why do they call it rush hour when nobody's moving?",
    lang: 'en',
    style: 'observational',
    format: 'qa',
    topic: 'travel',
    tone: 'witty',
    creator: 'seed'
  },
  {
    txt: "I love how my phone gives me directions to places I've been to a hundred times, but can't remember where I put it.",
    lang: 'en',
    style: 'observational',
    format: 'text',
    topic: 'technology',
    tone: 'witty',
    creator: 'seed'
  },

  // English Jokes - Knock-knock
  {
    txt: "Knock knock!\nWho's there?\nInterrupting cow.\nInterrupting c—\nMOO!",
    lang: 'en',
    style: 'knock-knock',
    format: 'dialogue',
    topic: 'animals',
    tone: 'silly',
    creator: 'seed'
  },
  {
    txt: "Knock knock!\nWho's there?\nLettuce.\nLettuce who?\nLettuce in, it's cold out here!",
    lang: 'en',
    style: 'knock-knock',
    format: 'dialogue',
    topic: 'food',
    tone: 'silly',
    creator: 'seed'
  },
  {
    txt: "Knock knock!\nWho's there?\nBoo.\nBoo who?\nDon't cry, it's just a joke!",
    lang: 'en',
    style: 'knock-knock',
    format: 'dialogue',
    topic: 'general',
    tone: 'family-friendly',
    creator: 'seed'
  },
  {
    txt: "Knock knock!\nWho's there?\nAlma.\nAlma who?\nAlma gonna tell you another knock-knock joke!",
    lang: 'en',
    style: 'knock-knock',
    format: 'dialogue',
    topic: 'general',
    tone: 'silly',
    creator: 'seed'
  },

  // English Jokes - One-liners
  {
    txt: "I told my wife she was drawing her eyebrows too high. She looked surprised.",
    lang: 'en',
    style: 'oneliners',
    format: 'text',
    topic: 'family',
    tone: 'witty',
    creator: 'seed'
  },
  {
    txt: "I haven't slept for ten days, because that would be too long.",
    lang: 'en',
    style: 'oneliners',
    format: 'text',
    topic: 'everyday',
    tone: 'absurd',
    creator: 'seed'
  },
  {
    txt: "I used to be addicted to soap, but I'm clean now.",
    lang: 'en',
    style: 'oneliners',
    format: 'text',
    topic: 'everyday',
    tone: 'clever',
    creator: 'seed'
  },
  {
    txt: "I'm on a seafood diet. I see food and I eat it.",
    lang: 'en',
    style: 'oneliners',
    format: 'text',
    topic: 'food',
    tone: 'silly',
    creator: 'seed'
  },
  {
    txt: "Time flies like an arrow. Fruit flies like a banana.",
    lang: 'en',
    style: 'oneliners',
    format: 'text',
    topic: 'general',
    tone: 'clever',
    creator: 'seed'
  },

  // English Jokes - Animals
  {
    txt: "What do you call a sleeping bull? A bulldozer!",
    lang: 'en',
    style: 'pun',
    format: 'qa',
    topic: 'animals',
    tone: 'silly',
    creator: 'seed'
  },
  {
    txt: "Why don't elephants use computers? They're afraid of the mouse!",
    lang: 'en',
    style: 'general',
    format: 'qa',
    topic: 'animals',
    tone: 'silly',
    creator: 'seed'
  },
  {
    txt: "What do you call a bear with no teeth? A gummy bear!",
    lang: 'en',
    style: 'pun',
    format: 'qa',
    topic: 'animals',
    tone: 'silly',
    creator: 'seed'
  },
  {
    txt: "Why do fish live in saltwater? Because pepper makes them sneeze!",
    lang: 'en',
    style: 'general',
    format: 'qa',
    topic: 'animals',
    tone: 'silly',
    creator: 'seed'
  },
  {
    txt: "What do you call a pig that does karate? A pork chop!",
    lang: 'en',
    style: 'pun',
    format: 'qa',
    topic: 'animals',
    tone: 'silly',
    creator: 'seed'
  },

  // English Jokes - Technology
  {
    txt: "Why did the computer go to the doctor? Because it had a virus!",
    lang: 'en',
    style: 'general',
    format: 'qa',
    topic: 'technology',
    tone: 'silly',
    creator: 'seed'
  },
  {
    txt: "How do you comfort a JavaScript bug? You console it!",
    lang: 'en',
    style: 'pun',
    format: 'qa',
    topic: 'technology',
    tone: 'clever',
    creator: 'seed'
  },
  {
    txt: "Why do programmers prefer dark mode? Because light attracts bugs!",
    lang: 'en',
    style: 'general',
    format: 'qa',
    topic: 'technology',
    tone: 'clever',
    creator: 'seed'
  },
  {
    txt: "A SQL query goes into a bar, walks up to two tables and asks: 'Can I join you?'",
    lang: 'en',
    style: 'pun',
    format: 'text',
    topic: 'technology',
    tone: 'clever',
    creator: 'seed'
  },
  {
    txt: "Why did the smartphone go to therapy? It had too many hang-ups!",
    lang: 'en',
    style: 'pun',
    format: 'qa',
    topic: 'technology',
    tone: 'witty',
    creator: 'seed'
  },

  // Spanish Jokes
  {
    txt: "¿Por qué los pájaros vuelan hacia el sur en invierno? Porque es demasiado lejos para caminar!",
    lang: 'es',
    style: 'general',
    format: 'qa',
    topic: 'animals',
    tone: 'silly',
    creator: 'seed'
  },
  {
    txt: "¿Qué le dice un taco a otro taco? ¿Quieres salir a cenar?",
    lang: 'es',
    style: 'pun',
    format: 'qa',
    topic: 'food',
    tone: 'silly',
    creator: 'seed'
  },
  {
    txt: "¿Cómo se llama el campeón de buceo japonés? Tokofondo!",
    lang: 'es',
    style: 'pun',
    format: 'qa',
    topic: 'sports',
    tone: 'silly',
    creator: 'seed'
  },
  {
    txt: "¿Qué hace una abeja en el gimnasio? ¡Zum-ba!",
    lang: 'es',
    style: 'pun',
    format: 'qa',
    topic: 'animals',
    tone: 'silly',
    creator: 'seed'
  },
  {
    txt: "¿Por qué la escoba llegó tarde? Porque se quedó barriendo!",
    lang: 'es',
    style: 'pun',
    format: 'qa',
    topic: 'everyday',
    tone: 'silly',
    creator: 'seed'
  },
  {
    txt: "¿Qué le dice un jardinero a otro? ¡Qué plantón me diste!",
    lang: 'es',
    style: 'pun',
    format: 'qa',
    topic: 'work',
    tone: 'silly',
    creator: 'seed'
  },
  {
    txt: "¿Cómo se dice dormido en japonés? Yakuza!",
    lang: 'es',
    style: 'pun',
    format: 'qa',
    topic: 'general',
    tone: 'silly',
    creator: 'seed'
  },
  {
    txt: "¿Qué le dice un gusano a otro gusano? Voy a dar una vuelta a la manzana.",
    lang: 'es',
    style: 'pun',
    format: 'qa',
    topic: 'animals',
    tone: 'silly',
    creator: 'seed'
  },
  {
    txt: "¿Por qué los peces no tocan el piano? Porque no tienen las escalas!",
    lang: 'es',
    style: 'pun',
    format: 'qa',
    topic: 'animals',
    tone: 'clever',
    creator: 'seed'
  },
  {
    txt: "¿Cómo se llama el primo de Bruce Lee? Broco Lee!",
    lang: 'es',
    style: 'pun',
    format: 'qa',
    topic: 'food',
    tone: 'silly',
    creator: 'seed'
  },
  {
    txt: "¿Qué le dice una iguana a su hermana gemela? Somos iguanitas!",
    lang: 'es',
    style: 'pun',
    format: 'qa',
    topic: 'animals',
    tone: 'family-friendly',
    creator: 'seed'
  },
  {
    txt: "¿Por qué la computadora fue al médico? Porque tenía un virus!",
    lang: 'es',
    style: 'general',
    format: 'qa',
    topic: 'technology',
    tone: 'silly',
    creator: 'seed'
  },
  {
    txt: "¿Qué hace un pez en el internet? Nada en la red!",
    lang: 'es',
    style: 'pun',
    format: 'qa',
    topic: 'technology',
    tone: 'clever',
    creator: 'seed'
  },
  {
    txt: "¿Cómo se llama el pez más negativo? Pescimista!",
    lang: 'es',
    style: 'pun',
    format: 'qa',
    topic: 'animals',
    tone: 'clever',
    creator: 'seed'
  },
  {
    txt: "¿Qué le dice un semáforo a otro? No me mires que me estoy cambiando!",
    lang: 'es',
    style: 'general',
    format: 'qa',
    topic: 'everyday',
    tone: 'silly',
    creator: 'seed'
  },
  {
    txt: "¿Por qué las vacas usan cencerro? Porque sus cuernos no funcionan!",
    lang: 'es',
    style: 'pun',
    format: 'qa',
    topic: 'animals',
    tone: 'silly',
    creator: 'seed'
  },
  {
    txt: "¿Qué le dice un café a otro café? Espresso mis sentimientos!",
    lang: 'es',
    style: 'pun',
    format: 'qa',
    topic: 'food',
    tone: 'witty',
    creator: 'seed'
  },
  {
    txt: "¿Cómo se llama el boomerang que no regresa? Palo!",
    lang: 'es',
    style: 'pun',
    format: 'qa',
    topic: 'general',
    tone: 'silly',
    creator: 'seed'
  },
  {
    txt: "¿Por qué los elefantes no usan computadoras? Porque le tienen miedo al ratón!",
    lang: 'es',
    style: 'general',
    format: 'qa',
    topic: 'animals',
    tone: 'silly',
    creator: 'seed'
  },
  {
    txt: "¿Qué hace un perro con un taladro? Taladrando!",
    lang: 'es',
    style: 'pun',
    format: 'qa',
    topic: 'animals',
    tone: 'absurd',
    creator: 'seed'
  },

  // French Jokes
  {
    txt: "Pourquoi les plongeurs plongent-ils toujours en arrière et jamais en avant? Parce que sinon, ils tombent dans le bateau!",
    lang: 'fr',
    style: 'general',
    format: 'qa',
    topic: 'sports',
    tone: 'silly',
    creator: 'seed'
  },
  {
    txt: "Que dit un escargot quand il croise une limace? 'Regarde, un nudiste!'",
    lang: 'fr',
    style: 'general',
    format: 'qa',
    topic: 'animals',
    tone: 'silly',
    creator: 'seed'
  },
  {
    txt: "Pourquoi les poissons n'aiment pas jouer au tennis? Parce qu'ils ont peur du filet!",
    lang: 'fr',
    style: 'pun',
    format: 'qa',
    topic: 'animals',
    tone: 'clever',
    creator: 'seed'
  },
  {
    txt: "Comment appelle-t-on un chat tombé dans un pot de peinture le jour de Noël? Un chat-mallow!",
    lang: 'fr',
    style: 'pun',
    format: 'qa',
    topic: 'animals',
    tone: 'silly',
    creator: 'seed'
  },
  {
    txt: "Que dit un pingouin qui ne savait pas voler? Pas grave, je sais nager!",
    lang: 'fr',
    style: 'general',
    format: 'qa',
    topic: 'animals',
    tone: 'family-friendly',
    creator: 'seed'
  },
  {
    txt: "Pourquoi les plongeurs plongent toujours en arrière? Parce que s'ils plongent en avant, ils tombent dans le bateau!",
    lang: 'fr',
    style: 'general',
    format: 'qa',
    topic: 'sports',
    tone: 'silly',
    creator: 'seed'
  },
  {
    txt: "Comment appelle-t-on un chien qui n'a pas de pattes? On ne l'appelle pas, on va le chercher!",
    lang: 'fr',
    style: 'general',
    format: 'qa',
    topic: 'animals',
    tone: 'silly',
    creator: 'seed'
  },
  {
    txt: "Que dit un avocat quand il se regarde dans le miroir? Avocat du diable!",
    lang: 'fr',
    style: 'pun',
    format: 'qa',
    topic: 'work',
    tone: 'witty',
    creator: 'seed'
  },
  {
    txt: "Pourquoi les poules ne portent pas de culotte? Parce que le coq n'a pas de tiroir!",
    lang: 'fr',
    style: 'general',
    format: 'qa',
    topic: 'animals',
    tone: 'silly',
    creator: 'seed'
  },
  {
    txt: "Comment appelle-t-on un boomerang qui ne revient pas? Un cintre!",
    lang: 'fr',
    style: 'pun',
    format: 'qa',
    topic: 'general',
    tone: 'clever',
    creator: 'seed'
  },
  {
    txt: "Qu'est-ce qui est jaune et qui attend? Jonathan!",
    lang: 'fr',
    style: 'pun',
    format: 'qa',
    topic: 'general',
    tone: 'absurd',
    creator: 'seed'
  },
  {
    txt: "Pourquoi les frites ne sont jamais stressées? Parce qu'elles restent zen même dans l'huile bouillante!",
    lang: 'fr',
    style: 'observational',
    format: 'qa',
    topic: 'food',
    tone: 'witty',
    creator: 'seed'
  },
  {
    txt: "Comment appelle-t-on un café qui n'a pas payé ses dettes? Un expresso!",
    lang: 'fr',
    style: 'pun',
    format: 'qa',
    topic: 'food',
    tone: 'clever',
    creator: 'seed'
  },
  {
    txt: "Que dit un ordinateur quand il a mal? J'ai un bug!",
    lang: 'fr',
    style: 'general',
    format: 'qa',
    topic: 'technology',
    tone: 'silly',
    creator: 'seed'
  },
  {
    txt: "Pourquoi les informaticiens préfèrent-ils Halloween à Noël? Parce qu'Oct 31 = Dec 25!",
    lang: 'fr',
    style: 'pun',
    format: 'qa',
    topic: 'technology',
    tone: 'clever',
    creator: 'seed'
  },
  {
    txt: "Comment appelle-t-on quelqu'un qui refuse de se servir d'Internet? Un déconnecté!",
    lang: 'fr',
    style: 'pun',
    format: 'qa',
    topic: 'technology',
    tone: 'witty',
    creator: 'seed'
  },
  {
    txt: "Qu'est-ce qui est long, dur et que les femmes n'aiment pas partager? Les files d'attente!",
    lang: 'fr',
    style: 'general',
    format: 'qa',
    topic: 'everyday',
    tone: 'witty',
    creator: 'seed'
  },
  {
    txt: "Pourquoi les mexicains mangent-ils épicé? Pour avoir l'haleine fraîche comparé à leurs amis!",
    lang: 'fr',
    style: 'observational',
    format: 'qa',
    topic: 'food',
    tone: 'witty',
    creator: 'seed'
  },
  {
    txt: "Comment fait-on pour allumer un barbecue breton? On utilise des allume-feu Breizh!",
    lang: 'fr',
    style: 'pun',
    format: 'qa',
    topic: 'food',
    tone: 'silly',
    creator: 'seed'
  },
  {
    txt: "Que dit un cannibale qui mange de la soupe? 'Hmm, ce bouillon a un goût de reviens-y!'",
    lang: 'fr',
    style: 'dark',
    format: 'qa',
    topic: 'food',
    tone: 'witty',
    creator: 'seed'
  },

  // More English Jokes to reach 100+
  {
    txt: "Why don't calendars ever get tired? Because they have lots of dates!",
    lang: 'en',
    style: 'pun',
    format: 'qa',
    topic: 'everyday',
    tone: 'silly',
    creator: 'seed'
  },
  {
    txt: "What do you call a factory that makes okay products? A satisfactory!",
    lang: 'en',
    style: 'pun',
    format: 'qa',
    topic: 'work',
    tone: 'clever',
    creator: 'seed'
  },
  {
    txt: "Why did the coffee file a police report? It got mugged!",
    lang: 'en',
    style: 'pun',
    format: 'qa',
    topic: 'food',
    tone: 'silly',
    creator: 'seed'
  },
  {
    txt: "What do you call a dinosaur that crashes his car? Tyrannosaurus Wrecks!",
    lang: 'en',
    style: 'pun',
    format: 'qa',
    topic: 'general',
    tone: 'silly',
    creator: 'seed'
  },
  {
    txt: "Why don't scientists trust atoms? Because they make up everything and spread rumors at the molecular level!",
    lang: 'en',
    style: 'wordplay',
    format: 'qa',
    topic: 'science',
    tone: 'clever',
    creator: 'seed'
  },
  {
    txt: "I tried to catch fog earlier. I mist.",
    lang: 'en',
    style: 'pun',
    format: 'text',
    topic: 'general',
    tone: 'silly',
    creator: 'seed'
  },
  {
    txt: "Why did the bicycle fall over? Because it was two tired!",
    lang: 'en',
    style: 'pun',
    format: 'qa',
    topic: 'travel',
    tone: 'silly',
    creator: 'seed'
  },
  {
    txt: "What's the best thing about Switzerland? I don't know, but the flag is a big plus.",
    lang: 'en',
    style: 'pun',
    format: 'text',
    topic: 'travel',
    tone: 'clever',
    creator: 'seed'
  },
  {
    txt: "Did you hear about the mathematician who's afraid of negative numbers? He'll stop at nothing to avoid them!",
    lang: 'en',
    style: 'pun',
    format: 'qa',
    topic: 'science',
    tone: 'clever',
    creator: 'seed'
  },
  {
    txt: "Why did the golfer wear two pairs of pants? In case he got a hole in one!",
    lang: 'en',
    style: 'pun',
    format: 'qa',
    topic: 'sports',
    tone: 'silly',
    creator: 'seed'
  },
  {
    txt: "What do you call a belt made of watches? A waist of time!",
    lang: 'en',
    style: 'pun',
    format: 'qa',
    topic: 'general',
    tone: 'silly',
    creator: 'seed'
  },
  {
    txt: "How do you organize a space party? You planet!",
    lang: 'en',
    style: 'pun',
    format: 'qa',
    topic: 'science',
    tone: 'silly',
    creator: 'seed'
  },
  {
    txt: "Why don't skeletons fight each other? They don't have the guts!",
    lang: 'en',
    style: 'pun',
    format: 'qa',
    topic: 'general',
    tone: 'silly',
    creator: 'seed'
  },
  {
    txt: "What did the ocean say to the beach? Nothing, it just waved!",
    lang: 'en',
    style: 'pun',
    format: 'qa',
    topic: 'general',
    tone: 'family-friendly',
    creator: 'seed'
  },
  {
    txt: "Why did the cookie go to the doctor? Because it felt crumbly!",
    lang: 'en',
    style: 'pun',
    format: 'qa',
    topic: 'food',
    tone: 'silly',
    creator: 'seed'
  },
  {
    txt: "What's orange and sounds like a parrot? A carrot!",
    lang: 'en',
    style: 'general',
    format: 'qa',
    topic: 'food',
    tone: 'family-friendly',
    creator: 'seed'
  },
  {
    txt: "Why don't eggs tell each other jokes? Because they might crack up!",
    lang: 'en',
    style: 'pun',
    format: 'qa',
    topic: 'food',
    tone: 'family-friendly',
    creator: 'seed'
  },
  {
    txt: "What do you call a sleeping bull at the office? A bulldozer in a business meeting!",
    lang: 'en',
    style: 'pun',
    format: 'qa',
    topic: 'work',
    tone: 'silly',
    creator: 'seed'
  },
  {
    txt: "Why did the tomato turn red? Because it saw the salad dressing!",
    lang: 'en',
    style: 'general',
    format: 'qa',
    topic: 'food',
    tone: 'family-friendly',
    creator: 'seed'
  },
  {
    txt: "What's the difference between a poorly dressed person on a bicycle and a well-dressed person on a tricycle? Attire!",
    lang: 'en',
    style: 'pun',
    format: 'qa',
    topic: 'general',
    tone: 'clever',
    creator: 'seed'
  },

  // Additional jokes to reach 100+
  {
    txt: "Why don't programmers like nature? It has too many bugs!",
    lang: 'en',
    style: 'pun',
    format: 'qa',
    topic: 'technology',
    tone: 'clever',
    creator: 'seed'
  },
  {
    txt: "What did the ocean say to the shore? Nothing, it just waved!",
    lang: 'en',
    style: 'pun',
    format: 'qa',
    topic: 'general',
    tone: 'family-friendly',
    creator: 'seed'
  },
  {
    txt: "Why do fish live in saltwater? Because pepper makes them sneeze!",
    lang: 'en',
    style: 'dad',
    format: 'qa',
    topic: 'animals',
    tone: 'silly',
    creator: 'seed'
  },
  {
    txt: "How do you organize a space party? You planet!",
    lang: 'en',
    style: 'pun',
    format: 'qa',
    topic: 'science',
    tone: 'family-friendly',
    creator: 'seed'
  },
  {
    txt: "What do you call a dinosaur that crashes his car? Tyrannosaurus Wrecks!",
    lang: 'en',
    style: 'pun',
    format: 'qa',
    topic: 'general',
    tone: 'silly',
    creator: 'seed'
  },
  {
    txt: "Why did the math book look so sad? Because it had too many problems!",
    lang: 'en',
    style: 'dad',
    format: 'qa',
    topic: 'work',
    tone: 'family-friendly',
    creator: 'seed'
  }
];

/**
 * Statistics about the seed jokes dataset
 */
export const SEED_JOKES_STATS = {
  total: SEED_JOKES.length,
  by_language: {
    en: SEED_JOKES.filter(j => j.lang === 'en').length,
    es: SEED_JOKES.filter(j => j.lang === 'es').length,
    fr: SEED_JOKES.filter(j => j.lang === 'fr').length
  },
  by_style: {
    general: SEED_JOKES.filter(j => j.style === 'general').length,
    dad: SEED_JOKES.filter(j => j.style === 'dad').length,
    pun: SEED_JOKES.filter(j => j.style === 'pun').length,
    observational: SEED_JOKES.filter(j => j.style === 'observational').length,
    'knock-knock': SEED_JOKES.filter(j => j.style === 'knock-knock').length,
    oneliners: SEED_JOKES.filter(j => j.style === 'oneliners').length,
    wordplay: SEED_JOKES.filter(j => j.style === 'wordplay').length,
    dark: SEED_JOKES.filter(j => j.style === 'dark').length
  },
  by_topic: {
    general: SEED_JOKES.filter(j => j.topic === 'general').length,
    animals: SEED_JOKES.filter(j => j.topic === 'animals').length,
    food: SEED_JOKES.filter(j => j.topic === 'food').length,
    technology: SEED_JOKES.filter(j => j.topic === 'technology').length,
    work: SEED_JOKES.filter(j => j.topic === 'work').length,
    family: SEED_JOKES.filter(j => j.topic === 'family').length,
    travel: SEED_JOKES.filter(j => j.topic === 'travel').length,
    sports: SEED_JOKES.filter(j => j.topic === 'sports').length,
    science: SEED_JOKES.filter(j => j.topic === 'science').length,
    everyday: SEED_JOKES.filter(j => j.topic === 'everyday').length
  }
};