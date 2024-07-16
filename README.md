# MMBbS GPT

## Installation

Nach dem Clonen des Repositories sind über

```
npm install
```

die notwendigen Pakete zu installieren.

## Konfiguration

Dokumente die von der KI gelesen werden sollen, müssen im Vector Storage für den Assistenten in der openAI Oberfläche hochgeladen werden. Sollen diese Dokumente auch downloadbar sein, so müssen Sie unter gleichem Namen im Order **public/storage** abgelegt werden !

## Starten des Servers

Zunächst muss der OpenAI API Key und die Assistenten ID als Umgebungsvariable gesetzt werden:

```
set APIKEY=sk-proj-geheim
set AID=asst_uen-geheim
```

Anschließend kann der Server via...

```
npm start
```

gestartet werden.

## Umgebungsvariablen

Über die Umgebungsvariable **ALLOWED_ORIGIN** kann der Zugriff auf den Server eingeschränkt werden. Wenn die Umgebungsvariable gesetzt ist, kann der Zugriff auf den Server nur über die Domain erfolgen. Ansonsten ist der Zugriff beliebig.

```
set ALLOWED_ORIGIN=https://moodle.mm-bbs.de
```

Über die Umgebungsvariable **MAX_REQUESTS** kann die Anzahl von Requests pro IP und Tag eingeschränkt werden. Ist die variable gesetzt,

```
set MAX_REQUESTS=4
```

So sind pro IP nur 4 Anfragen von einer IP pro Tag möglich.


## Docker Container

Für die Anwendung existiert auch ein Dockercontainer

```
docker run -d -p 3000:3000 -e APIKEY=sk-proj-geheim -e AID=asst_uen-geheim service.joerg-tuttas.de:5555/root/mmbbs_gpt
```

### Volumes

Es existieren die folgenden Volumes:

- **/usr/src/app/public/storage**: Für die Dokumente, die auch zum herunterladen sind.

- **/usr/src/app/config**: Für Dateien server.cert und server.key zum Aufbau der https/wss Verbindung.

## Einbinden auf andere Webseiten

Der Chatbot kann über folgende Anweisung in eine andere Webseite eingebaut werden.

```html
<script type="module" async="" id="mmbbs-bot">
    const settings = {
        "host": "service.joerg-tuttas.de",
        "protocol":"https",
        "port": 3000
    };

    import {
        MMBBSBOT
    } from 'https://service.joerg-tuttas.de:3000/mmbbs-bot.js';
    const bot = new MMBBSBOT(settings);
</script>
```

ggf. muss natürlich die URL der Importanweisung angepasst werden.

## ToDo
