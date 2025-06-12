import { TpaServer, TpaSession, ViewType } from '@augmentos/sdk';
import * as ical from 'ical';
import axios from 'axios';
import { optionsPrompt } from './prompts';


const PACKAGE_NAME = process.env.PACKAGE_NAME ?? (() => { throw new Error('PACKAGE_NAME is not set in .env file'); })();
const AUGMENTOS_API_KEY = process.env.AUGMENTOS_API_KEY ?? (() => { throw new Error('AUGMENTOS_API_KEY is not set in .env file'); })();
const PORT = parseInt(process.env.PORT || '3000');

const ICAL = process.env.ICAL ?? (() => { throw new Error('ICAL is not set in .env file'); })();
const GEMINI_API = process.env.GEMINI_API ?? (() => { throw new Error('GEMINI_API is not set in .env file'); })();
const GEMINI_MODEL = process.env.GEMINI_MODEL ?? (() => { throw new Error('GEMINI_MODEL is not set in .env file'); })();

let chatHistory = "";
let cleverGuyMode = false;

class ExampleAugmentOSApp extends TpaServer {

  constructor() {
    super({
      packageName: PACKAGE_NAME,
      apiKey: AUGMENTOS_API_KEY,
      port: PORT,
    });
  }

  protected getNextEvent(icsData: string) {
    const events = ical.parseICS(icsData);
    const now = new Date();
  
    const upcomingEvents = Object.values(events)
      .filter(e => e.type === 'VEVENT' && e.start && e.start > now)
      .sort((a, b) => (a.start.getTime() - b.start.getTime()));
  
    return upcomingEvents[0]; // the next event
  }

  protected getTodayEvents(icsData: string) {
    const events = ical.parseICS(icsData);
    const now = new Date();

    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
    const endOfDay   = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);

    const upcomingEvents = Object.values(events)
    .filter((e: any) => e.type === 'VEVENT' && e.start && e.start >= startOfDay && e.start <= endOfDay)
    .sort((a: any, b: any) => a.start.getTime() - b.start.getTime());

    const formatter = new Intl.DateTimeFormat('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    });

    return upcomingEvents
      .map((e: any) => `${e.summary.trim() || 'Untitled'} | ${formatter.format(new Date(e.start))}`)
      .join('\n');
  }

  protected stripCodeBlock(text) {
    return text.replace(/```(?:json)?\s*|\s*```/g, '').trim();
  }

  protected async resetCleverGuy(delay: number): Promise<void> {
    await new Promise<void>(resolve => setTimeout(resolve, delay));
    cleverGuyMode = false;
  }

  

  protected async onSession(session: TpaSession, sessionId: string, userId: string): Promise<void> {

    // Show welcome message
    session.layouts.showTextWall("Example App is ready!");

    // Handle real-time transcription
    // requires microphone permission to be set in the developer console
    const eventHandlers = [
      session.events.onTranscription(async (data) => {
        if(!data.isFinal )
          return
          
        let transcription = data.text?.toLowerCase()

        if (transcription.includes("mira") || cleverGuyMode) {
          cleverGuyMode = true;
          this.resetCleverGuy(20000)

          session.layouts.showTextWall("Mira is thinking...", {
            view: ViewType.MAIN,
            durationMs: 7500
          });

          chatHistory += "\nUser said: " + transcription;
          const prompt = optionsPrompt();

          const load = {
              contents: [
                  {
                      role: 'user',
                      parts: [
                          {
                              text: prompt + "\n" + transcription + "Previous messages were: \n" + chatHistory,
                          },
                      ],
                  },
              ],
              tools: [
                {
                  urlContext: {}
                },
              ],
          };

          console.log(load.contents[0].parts[0].text)
          
      
          try {
              const response = await axios.post(
                  `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API}`,
                  load,
                  {
                      headers: {
                          'Content-Type': 'application/json',
                      },
                  },
              );

              const rawText = response.data.candidates[0].content.parts[0].text;
              const cleanText = this.stripCodeBlock(rawText);
              const parsed = JSON.parse(cleanText);

              chatHistory += "\n AI replied: " + parsed.Answer;

              session.layouts.showTextWall(parsed.Answer, {
                view: ViewType.MAIN,
                durationMs: 7500
              });


          } catch (err) {
              throw new Error('Gemini broke: ' + (err?.response?.data?.error?.message || err.message || 'Unknown error'));
          }
        }

        else if (transcription.includes("next")) {
          fetch(ICAL)
          .then(res => res.text())
          .then(icsData => {
            const nextEvent = this.getNextEvent(icsData);
            session.layouts.showTextWall("Next event: \n" + nextEvent?.summary + " at " + nextEvent?.start.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }), {
              view: ViewType.MAIN,
              durationMs: 7500
            });
            
          });

        }

        else if (transcription.includes("schedule")) {
          fetch(ICAL)
          .then(res => res.text())
          .then(icsData => {
            const todayEvents = this.getTodayEvents(icsData);
            const message = todayEvents;
            session.layouts.showTextWall(message, {
              view: ViewType.MAIN,
              durationMs: 4000 + message.length * 50
            });
            
          });
        }

        

      }),

      session.events.onGlassesBattery((data) => {
        console.log('Glasses battery:', data);
      })
    ];

    // Add cleanup handlers
    eventHandlers.forEach(eventHandler => this.addCleanupHandler(eventHandler));
  }
}

// Start the server
// DEV CONSOLE URL: https://console.augmentos.org/
// Get your webhook URL from ngrok (or whatever public URL you have)
const app = new ExampleAugmentOSApp();

app.start().catch(console.error);