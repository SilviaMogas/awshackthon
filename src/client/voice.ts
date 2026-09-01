/**
 * Modular voice service interface. Prepares for Amazon Transcribe (speech-to-
 * text) and Amazon Polly (spoken responses). If Transcribe is not configured,
 * we expose the button and, in Demo Mode, simulate transcription clearly
 * labelled as simulated. Text input always remains available.
 */
export interface VoiceService {
  isConfigured(): boolean;
  /** Start recording; resolves with transcribed text (or simulated text). */
  transcribe(demoText: string): Promise<{ text: string; simulated: boolean }>;
  speak?(text: string, lang: string): Promise<void>;
}

class SimulatedVoiceService implements VoiceService {
  isConfigured(): boolean {
    return false; // Amazon Transcribe not wired in the MVP.
  }
  async transcribe(demoText: string): Promise<{ text: string; simulated: boolean }> {
    // Simulate a short recording delay. Real impl would stream mic audio to
    // Amazon Transcribe and return the recognised transcript.
    await new Promise((r) => setTimeout(r, 900));
    return { text: demoText, simulated: true };
  }
}

export const voiceService: VoiceService = new SimulatedVoiceService();
