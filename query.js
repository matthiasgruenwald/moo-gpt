import axios from "axios";
import cheerio from "cheerio";

async function fetchPage(url) {
  try {
    const { data } = await axios.get(url);
    return data;
  } catch (error) {
    console.error(`Error fetching ${url}:`, error);
    return null;
  }
}

function extractText(html) {
  const $ = cheerio.load(html);
  // Entferne alle Skripte und Stile im .page-content Container
  $(".page-content script, .page-content style").remove();
  // Extrahiere den reinen Text aus dem .page-content Container
  return $(".page-content").text();
}

function extractLinks(html) {
  const $ = cheerio.load(html);
  const links = [];
  $(".page-content a").each((index, element) => {
    const href = $(element).attr("href");
    if (href) {
      links.push(href);
    }
  });
  return links;
}

async function fetchAndExtract(url) {
  const result = [];

  const html = await fetchPage(url);
  if (!html) return result;

  const text = extractText(html);
  result.push({ url, text });

  const links = extractLinks(html);
  for (var i=0;i<2;i++) {
    const absoluteLink = new URL(links[i], url).href;
    const linkHtml = await fetchPage(absoluteLink);
    if (linkHtml) {
      const linkText = extractText(linkHtml);
      result.push({ url: absoluteLink, text: linkText });
    }
  }

  return result;
}

const url = "https://www.mmbbs.de/?s=Oracle";
fetchAndExtract(url).then((result) => {
  console.log(result);
});
