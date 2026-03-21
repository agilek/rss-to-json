import Parser from "rss-parser";
import fs from "fs";

const parser = new Parser({
  timeout: 10000, // avoid hanging requests
});

const OUTPUT_PATH = "./data/feed.json";
const MAX_ITEMS = 100;

// load feeds config
const feeds = JSON.parse(fs.readFileSync("./config/feeds.json", "utf-8"));

// load existing data
function loadExisting() {
  if (!fs.existsSync(OUTPUT_PATH)) return [];
  return JSON.parse(fs.readFileSync(OUTPUT_PATH, "utf-8"));
}

// save data
function save(data) {
  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(data, null, 2));
}

// clean summary text
function cleanText(text) {
  if (!text) return "";

  return text
    .replace(/\s+/g, " ")
    .replace(/<[^>]*>/g, "")
    .trim();
}

// transform item safely
function normalizeItem(item, sourceId) {
  try {
    return {
      id: `${sourceId}-${item.link || Math.random()}`,
      source: sourceId,
      title: item.title || "",
      url: item.link || "",
      publishedAt: item.isoDate || item.pubDate || null,
      summary: cleanText(item.contentSnippet || item.content || ""),
      image: null,
    };
  } catch (err) {
    return null; // skip broken item
  }
}

async function run() {
  const existing = loadExisting();

  // deduplication map
  const map = new Map(existing.map((item) => [item.id, item]));

  for (const feed of feeds) {
    console.log(`Fetching: ${feed.id}`);

    try {
      const parsed = await parser.parseURL(feed.url);

      if (!parsed || !parsed.items || !Array.isArray(parsed.items)) {
        console.warn(`Skipping ${feed.id}: invalid response`);
        continue;
      }

      const normalizedItems = parsed.items
        .map((item) => normalizeItem(item, feed.id))
        .filter(Boolean) // remove nulls
        .slice(0, 10);

      normalizedItems.forEach((item) => {
        map.set(item.id, item);
      });

      console.log(`Fetched ${normalizedItems.length} items (limited to 10)`);
    } catch (err) {
      console.error(`Failed: ${feed.id}`);
      console.error(err.message);
      continue; // 🔹 move on to next feed
    }
  }

  // sort + global limit
  const allItems = Array.from(map.values())
    .filter((item) => item.publishedAt) // avoid invalid dates
    .sort((a, b) => new Date(b.publishedAt) - new Date(a.publishedAt))
    .slice(0, MAX_ITEMS);

  save(allItems);

  console.log(`Saved ${allItems.length} items to ${OUTPUT_PATH}`);
}

run()
  .then(() => {
    console.log("Done");
    process.exit(0);
  })
  .catch((err) => {
    console.error("Fatal error:", err);
    process.exit(1);
  });
