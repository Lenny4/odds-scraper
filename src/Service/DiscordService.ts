'use strict';

export default class DiscordService {
    public static async send(message: string, now: number | null = null) {
        if (process.env.APP_ENV !== "prod") {
            return;
        }
        if (now === null) {
            now = Date.now();
        }
        const maxLength = 2_000;
        try {
            const res = await fetch(process.env.DISCORD_WEBHOOK ?? '', {
                method: "POST",
                headers: {
                    'Content-type': 'application/json'
                },
                body: JSON.stringify({
                    'username': 'orbitx-scrapper',
                    'content': (new Date(now!).toLocaleString('fr-FR', {
                        timeStyle: 'long'
                    }) + " [" + now + "]\n" + message).substring(0, maxLength),
                })
            });
        } catch (e) {
            console.error("try to sendNotificationDiscord but error: ", e);
        }
    }
}
