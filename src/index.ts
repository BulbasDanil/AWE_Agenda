import { TpaServer, TpaSession, ViewType } from '@augmentos/sdk';
import * as ical from 'ical';


const PACKAGE_NAME = process.env.PACKAGE_NAME ?? (() => { throw new Error('PACKAGE_NAME is not set in .env file'); })();
const AUGMENTOS_API_KEY = process.env.AUGMENTOS_API_KEY ?? (() => { throw new Error('AUGMENTOS_API_KEY is not set in .env file'); })();
const PORT = parseInt(process.env.PORT || '3000');

const ICAL = process.env.ICAL ?? (() => { throw new Error('ICAL is not set in .env file'); })();

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
      .sort((a: any, b: any) => (a.start.getTime() - b.start.getTime()));

    return upcomingEvents;
  }

  

  protected async onSession(session: TpaSession, sessionId: string, userId: string): Promise<void> {

    // Show welcome message
    session.layouts.showTextWall("Example App is ready!");

    // Handle real-time transcription
    // requires microphone permission to be set in the developer console
    const eventHandlers = [
      session.events.onTranscription((data) => {
        if (data.isFinal && data.text?.toLowerCase().includes("next")) {

          fetch(ICAL)
          .then(res => res.text())
          .then(icsData => {
            const nextEvent = this.getNextEvent(icsData);
            session.layouts.showTextWall("Next event: " + nextEvent?.summary + " at " + nextEvent?.start.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }), {
              view: ViewType.MAIN,
              durationMs: 7500
            });
            
          });

        }

        else if (data.isFinal && data.text?.toLowerCase().includes("agenda")) {

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