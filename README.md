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

Über die Umgebungsvariable **ALLOWED_ORIGIN** kann der Zugriff auf den Server eingeschränkt werden. Wenn die Umgebungsvariable gesetzt ist, kann der Zugriff auf den Server nur über die Domain erfolgen. Ansonsten ist der Zugriff beliebig.

```
set ALLOWED_ORIGIN=moodle.mm-bbs.de
```

## Docker Container

Für die Anwendung existiert auch ein Dockercontainer

```
docker run -d -p 3000:3000 -e APIKEY=sk-proj-geheim -e AID=asst_uen-geheim service.joerg-tuttas.de:5555/root/mmbbs_gpt
```

## ToDo

- Zu viele Req. von einer IP
- Include Script
- Suchen auf der Webseite