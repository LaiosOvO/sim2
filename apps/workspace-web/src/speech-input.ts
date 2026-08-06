interface SpeechRecognitionResultEvent extends Event {
  results: SpeechRecognitionResultList
  resultIndex: number
}

interface SpeechRecognitionErrorEvent extends Event {
  error: string
}

interface SpeechRecognitionInstance extends EventTarget {
  continuous: boolean
  interimResults: boolean
  lang: string
  onend: (() => void) | null
  onerror: ((event: SpeechRecognitionErrorEvent) => void) | null
  onresult: ((event: SpeechRecognitionResultEvent) => void) | null
  start(): void
  stop(): void
}

interface SpeechRecognitionConstructor {
  new (): SpeechRecognitionInstance
}

interface SpeechWindow extends Window {
  SpeechRecognition?: SpeechRecognitionConstructor
  webkitSpeechRecognition?: SpeechRecognitionConstructor
}

export interface SpeechSession {
  stop: () => void
}

interface StartSpeechOptions {
  locale: string
  onEnd: () => void
  onError: (message: string) => void
  onTranscript: (text: string) => void
}

export function startSpeechInput(options: StartSpeechOptions): SpeechSession {
  const speechWindow = window as SpeechWindow
  const Recognition = speechWindow.SpeechRecognition ?? speechWindow.webkitSpeechRecognition
  if (!Recognition) {
    throw new Error('Speech recognition is not supported by this browser')
  }

  const recognition = new Recognition()
  recognition.continuous = true
  recognition.interimResults = true
  recognition.lang = options.locale
  let finalTranscript = ''
  recognition.onresult = (event) => {
    let interimTranscript = ''
    for (let index = event.resultIndex; index < event.results.length; index += 1) {
      const result = event.results[index]
      const transcript = result?.[0]?.transcript ?? ''
      if (result?.isFinal) {
        finalTranscript = `${finalTranscript} ${transcript}`.trim()
      } else {
        interimTranscript = `${interimTranscript} ${transcript}`.trim()
      }
    }
    const transcript = `${finalTranscript} ${interimTranscript}`.trim()
    if (transcript.trim()) options.onTranscript(transcript.trim())
  }
  recognition.onerror = (event) => {
    options.onError(`Speech recognition failed: ${event.error}`)
  }
  recognition.onend = options.onEnd
  recognition.start()
  return { stop: () => recognition.stop() }
}
