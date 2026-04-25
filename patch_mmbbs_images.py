#!/usr/bin/env python3
"""
Patch script for /opt/mmbbs-gpt/server.js in Proxmox CT106.
Replaces broken image-handling block with a version that fetches images
as base64 to avoid OpenAI BadRequestError 400 on inaccessible URLs.

Usage (from Proxmox host):
    pct exec 106 -- python3 /tmp/patch_mmbbs_images.py
"""

import shutil
import sys

TARGET = "/opt/mmbbs-gpt/server.js"
BACKUP = "/opt/mmbbs-gpt/server.js.bak"

OLD_BLOCK = """\
                if (settings.images && settings.images.length > 0) {
                  console.log(`Füge ${settings.images.length} Bild(er) zum Thread hinzu`);
                  const imageContent = [
                    { type: "text", text: "Aufgabenstellung (enthält Bilder):" },
                    ...settings.images.map((img) => ({
                      type: "image_url",
                      image_url: { url: img },
                    })),
                  ];
                  await oai.beta.threads.messages.create(thread.id, {
                    role: "user",
                    content: imageContent,
                  });
                  console.log("Bilder zum Thread hinzugefügt");
                }\
"""

NEW_BLOCK = """\
                if (settings.images && settings.images.length > 0) {
                  console.log(`Füge ${settings.images.length} Bild(er) zum Thread hinzu`);
                  const imageItems = [];
                  for (const img of settings.images) {
                    try {
                      const parsed = new URL(img);
                      if (!['http:', 'https:'].includes(parsed.protocol)) {
                        console.log(`Bild übersprungen (ungültiges Protokoll): ${img}`);
                        continue;
                      }
                      const res = await fetch(img);
                      if (!res.ok) {
                        console.log(`Bild übersprungen (HTTP ${res.status}): ${img}`);
                        continue;
                      }
                      const contentType = res.headers.get('content-type') || 'image/jpeg';
                      const buf = await res.arrayBuffer();
                      const b64 = Buffer.from(buf).toString('base64');
                      imageItems.push({
                        type: "image_url",
                        image_url: { url: `data:${contentType};base64,${b64}` },
                      });
                    } catch (e) {
                      console.log(`Bild übersprungen (Fehler): ${img} - ${e.message}`);
                    }
                  }
                  if (imageItems.length > 0) {
                    const imageContent = [
                      { type: "text", text: "Aufgabenstellung (enthält Bilder):" },
                      ...imageItems,
                    ];
                    await oai.beta.threads.messages.create(thread.id, {
                      role: "user",
                      content: imageContent,
                    });
                    console.log(`${imageItems.length} Bild(er) zum Thread hinzugefügt`);
                  } else {
                    console.log("Keine gültigen Bilder gefunden, übersprungen");
                  }
                }\
"""


def main():
    # --- Read source file ---
    try:
        with open(TARGET, "r", encoding="utf-8") as fh:
            original = fh.read()
    except FileNotFoundError:
        print(f"ERROR: File not found: {TARGET}")
        sys.exit(1)
    except OSError as exc:
        print(f"ERROR: Cannot read {TARGET}: {exc}")
        sys.exit(1)

    # --- Check the block is present exactly once ---
    occurrences = original.count(OLD_BLOCK)
    if occurrences == 0:
        print("BLOCK NOT FOUND - no changes made")
        sys.exit(2)
    if occurrences > 1:
        print(f"ERROR: Old block found {occurrences} times — ambiguous, aborting")
        sys.exit(3)

    # --- Write backup ---
    try:
        shutil.copy2(TARGET, BACKUP)
        print(f"Backup written to {BACKUP}")
    except OSError as exc:
        print(f"ERROR: Cannot write backup {BACKUP}: {exc}")
        sys.exit(1)

    # --- Apply patch ---
    patched = original.replace(OLD_BLOCK, NEW_BLOCK, 1)

    # Sanity check: replacement actually changed something
    if patched == original:
        print("ERROR: Replacement produced identical content — aborting")
        sys.exit(1)

    # --- Write patched file ---
    try:
        with open(TARGET, "w", encoding="utf-8") as fh:
            fh.write(patched)
    except OSError as exc:
        print(f"ERROR: Cannot write {TARGET}: {exc}")
        print(f"Original file is intact; backup is at {BACKUP}")
        sys.exit(1)

    print("PATCH OK")


if __name__ == "__main__":
    main()
