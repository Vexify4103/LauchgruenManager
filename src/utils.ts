const SOURCEBIN_URL_REGEX = /^https?:\/\/(?:www\.)?(?:sourceb\.in|srcb\.in)\/([A-Za-z0-9]+)/i;
const DISCORD_ID_REGEX = /\b\d{17,20}\b/g;

export const ROLE_ACTION_DELAY_MS = 1000;

function getSourcebinKey(value: string): string | null {
  const match = value.match(SOURCEBIN_URL_REGEX);

  return match?.[1] ?? null;
}

async function fetchSourcebinText(sourcebinKey: string): Promise<string> {
  const metadataResponse = await fetch(`https://sourceb.in/api/bins/${sourcebinKey}`, {
    headers: {
      'User-Agent': 'launchmanager-turnier-bot',
      Accept: 'application/json',
    },
  });

  if (!metadataResponse.ok) {
    throw new Error(
      `Konnte Sourcebin-Metadaten nicht laden (${metadataResponse.status} ${metadataResponse.statusText}).`,
    );
  }

  const metadata = (await metadataResponse.json()) as {
    files?: Array<unknown>;
  };

  const fileCount = metadata.files?.length ?? 0;

  if (fileCount === 0) {
    throw new Error('In diesem Sourcebin wurden keine Dateien gefunden.');
  }

  const contents = await Promise.all(
    Array.from({ length: fileCount }, async (_, index) => {
      const rawResponse = await fetch(`https://cdn.sourceb.in/bins/${sourcebinKey}/${index}`, {
        headers: {
          'User-Agent': 'launchmanager-turnier-bot',
          Accept: 'text/plain',
        },
      });

      if (!rawResponse.ok) {
        throw new Error(
          `Konnte Sourcebin-Datei ${index} nicht laden (${rawResponse.status} ${rawResponse.statusText}).`,
        );
      }

      return rawResponse.text();
    }),
  );

  const combined = contents.map((content) => content.trim()).filter(Boolean).join('\n');

  if (!combined) {
    throw new Error('Im Sourcebin-Inhalt wurde kein lesbarer Text gefunden.');
  }

  return combined;
}

async function fetchTextFromUrl(url: string): Promise<string> {
  const sourcebinKey = getSourcebinKey(url);

  if (sourcebinKey) {
    return fetchSourcebinText(sourcebinKey);
  }

  const response = await fetch(url, {
    headers: {
      'User-Agent': 'launchmanager-turnier-bot',
      Accept: 'text/plain;q=1,application/json;q=0.9,*/*;q=0.8',
    },
  });

  if (!response.ok) {
    throw new Error(`Konnte Link nicht laden (${response.status} ${response.statusText}).`);
  }

  return response.text();
}

export async function loadRoleListInput(input: string): Promise<string> {
  const trimmed = input.trim();

  if (/^https?:\/\//i.test(trimmed)) {
    return fetchTextFromUrl(trimmed);
  }

  return trimmed;
}

export function extractDiscordUserIds(content: string): string[] {
  const matches = content.match(DISCORD_ID_REGEX) ?? [];

  return [...new Set(matches)];
}

export async function wait(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}
